import asyncio
import collections
import queue
import threading
import logging
import time
import re
from rapidfuzz import fuzz

# Heavy imports are deferred to __init__ for faster startup
sd = None
np = None
ctranslate2 = None
WhisperModel = None
HAS_SOUNDDEVICE = None  # Will be set on first check

# Configure logger
logger = logging.getLogger("momai.voice.detector")

# Light imports at module level
import app_state
import services.voice.tts as tts


def _ensure_heavy_imports():
    """Lazy-load heavy dependencies (ctranslate2, numpy, sounddevice, faster_whisper)."""
    global sd, np, ctranslate2, WhisperModel, HAS_SOUNDDEVICE
    
    if np is None:
        try:
            import numpy as _np
            np = _np
        except ImportError:
            pass

    if ctranslate2 is None:
        try:
            import ctranslate2 as _ct
            ctranslate2 = _ct
        except ImportError:
            pass

    if WhisperModel is None:
        try:
            from faster_whisper import WhisperModel as _WM
            WhisperModel = _WM
        except ImportError:
            pass

    if sd is None:
        try:
            import sounddevice as _sd
            sd = _sd
            HAS_SOUNDDEVICE = True
        except (OSError, ImportError):
            HAS_SOUNDDEVICE = False
            sd = None


class WakeWordDetector:
    """
    Wake Word Detector with proper end-of-speech detection.

    Instead of continuously transcribing a rolling buffer (which causes premature
    recognition), this detector uses a state machine approach:

    1. IDLE: Monitoring for speech activity via energy levels
    2. LISTENING: Speech detected, recording utterance into a growing buffer
    3. PROCESSING: Silence detected after speech, transcribe the complete utterance

    This ensures we only transcribe AFTER the user finishes speaking.
    """

    # States
    STATE_IDLE = "idle"
    STATE_LISTENING = "listening"
    STATE_PROCESSING = "processing"

    def __init__(
        self,
        keyword="computador",
        callback=None,
        status_callback=None,
        partial_callback=None,
        bypass_condition=None,
        variants=None,
        keyword_check_url=None,
    ):
        """
        Initializes the Wake Word detector using Faster-Whisper.
        """
        self.keyword = keyword.lower()
        self.variants = (
            [keyword.lower()] if not variants else [v.lower() for v in variants]
        )
        self.callback = callback
        self.status_callback = status_callback
        self.partial_callback = partial_callback
        self.bypass_condition = bypass_condition
        self.keyword_check_url = keyword_check_url
        self.running = False
        self.thread = None
        self.processing_thread = None
        self.lock = threading.Lock()
        self.model = None

        self.audio_queue = queue.Queue(maxsize=200)
        self.processing_queue = queue.Queue(maxsize=2)
        self.sample_rate = 16000

        # --- Speech detection parameters (wake word mode) ---
        self.speech_energy_threshold = 0.010  # Sensitive threshold for normal speaking volume
        self.silence_chunks_required = 5    # Give more breathing room (1.25s instead of 0.75s)
        self.min_speech_chunks = 2
        self.max_recording_duration = 15.0

        # --- Call mode parameters (balanced thresholds to prevent speaker echo & typing triggers) ---
        self.call_energy_threshold = 0.008  # Ultra-sensitive threshold to capture soft voice starting words
        self.call_silence_chunks = 5        # 1.25s end-of-speech detection for natural pauses without cutting off mid-sentence
        self.call_min_speech_chunks = 1     # Allow short 1-word responses ("Sim", "Não", "Oi") without discarding
        self.call_interrupt_threshold = 0.010 # Instant interruption threshold even for soft speaking during TTS
        self.interrupt_speech_counter = 0    # Counter for sustained speech chunks to avoid false keyboard click triggers
        self.post_tts_cooldown = 1.0        # Smooth post-speech cooldown after TTS finishes
        self._tts_stop_time = 0.0

        # --- State machine ---
        self.state = self.STATE_IDLE
        self.ring_buffer = collections.deque(maxlen=2)  # 500ms pre-speech buffer so initial syllables are never clipped
        self.speech_buffer = []
        self.tts_buffer = []
        self.tts_buffer_samples = 0
        self._tts_bg_energy = 0.005  # rolling baseline for TTS background energy
        self.speech_chunk_count = 0
        self.silence_counter = 0
        self.recorded_samples = 0
        self.active_recording_had_tts = False

        # --- Cooldown ---
        self.last_trigger_time = 0
        self.trigger_cooldown = 2.0
        self.last_text = ""
        self.last_text_time = 0.0
        self.text_repeat_cooldown = 1.0

        # Gate keyword detection (call mode bypass always works)
        self.wake_word_active = True
        self._stop_event = threading.Event()
        self._last_keyword_time = 0
        self._seq_counter = 0
    
    def _load_model(self, retries=0):
        """Lazy load heavy dependencies and model."""
        if self.model:
            return True

        _ensure_heavy_imports()

        if ctranslate2 is None or WhisperModel is None:
            if retries < 3:
                logger.debug(f"[WakeWord] Dependencies not ready, retrying in 5s... (attempt {retries+1}/3)")
                if self._stop_event.wait(timeout=5):
                    logger.debug("[WakeWord] Stop requested during model load retry")
                    return False
                return self._load_model(retries + 1)

            logger.warning("[WakeWord] Dependencies (ctranslate2/faster-whisper) not ready. Skipping model load.")
            return False

        # Faster-Whisper Configuration (singleton: shared across all call sites)
        try:
            self.model = app_state.get_whisper_model_singleton("base")
            logger.info("[WakeWord] Model ready: base")
            return True
        except Exception as e:
            logger.warning(
                f"[WakeWord] Could not load 'base' Whisper ({e}). Falling back to 'tiny' on CPU."
            )
            try:
                self.model = app_state.get_whisper_model_singleton("tiny")
                return True
            except Exception as e2:
                logger.error(
                    f"[WakeWord] Cannot even load tiny model: {e2}"
                )
                return False


    def _set_state(self, new_state):
        """Internal helper to change state and notify callback."""
        if self.state != new_state:
            self.state = new_state
            if self.status_callback:
                self.status_callback(new_state)

    def _audio_callback(self, indata, frames, time_info, status):
        """Callback for sounddevice."""
        if status:
            if "overflow" not in str(status).lower():
                logger.warning(f"[WakeWord] Audio Status: {status}")

        try:
            self.audio_queue.put_nowait(indata.copy().flatten())
        except queue.Full:
            try:
                self.audio_queue.get_nowait()
                self.audio_queue.put_nowait(indata.copy().flatten())
            except Exception:
                # Failed to clear queue, just drop current chunk
                pass

    def _get_chunk_energy(self, chunk):
        """Calculate RMS energy of an audio chunk."""
        return np.sqrt(np.mean(chunk**2))

    def _listen_loop(self):
        """Main listening loop with state-machine based speech segmentation."""
        logger.info("[WakeWord] Listener started (keyword='%s', mic=active)", self.keyword)

        _chunk_counter = 0
        _last_diag_time = time.time()

        try:
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                blocksize=4000,  # 250ms chunks at 16kHz
                callback=self._audio_callback,
            ):
                logger.info("[WakeWord] Microphone active. Ready and listening!")

                while self.running:
                    # Get audio chunk (blocking with timeout)
                    try:
                        chunk = self.audio_queue.get(timeout=0.5)
                    except queue.Empty:
                        continue

                    _chunk_counter += 1
                    energy = self._get_chunk_energy(chunk)

                    # Periodic diagnostic every 5 seconds
                    now = time.time()
                    if now - _last_diag_time >= 5.0:
                        try:
                            in_call = app_state.is_call_mode()
                        except Exception:
                            in_call = False
                        thresh = self.call_energy_threshold if in_call else self.speech_energy_threshold
                        logger.info(
                            "[WakeWord] Diag: chunks=%d energy=%.5f threshold=%.5f state=%s call_mode=%s queue=%d",
                            _chunk_counter, energy, thresh, self.state, in_call, self.audio_queue.qsize()
                        )
                        _last_diag_time = now
                    
                    if app_state.active_websockets:
                        if energy < 0.008:
                            # Noise gate: Keep visualizer canvas calm on ambient noise and keyboard clicks
                            all_bands = [[0.0] * 16 for _ in range(5)]
                        else:
                            sub_chunks = np.array_split(chunk, 5)
                            all_bands = []
                            for sc in sub_chunks:
                                fft_res = np.abs(np.fft.rfft(sc))
                                bands = np.array_split(fft_res, 16)
                                all_bands.append([float(np.mean(b)) for b in bands])

                        if app_state.main_loop:
                            asyncio.run_coroutine_threadsafe(
                                app_state.broadcast_to_sockets({"type": "voice_bands", "bands": all_bands}),
                                app_state.main_loop
                            )
                    if not self.running:
                        break

                    # Check if TTS is speaking
                    tts_speaking = False
                    try:
                        tts_speaking = tts.is_speaking() or getattr(app_state, "external_tts_speaking", False)
                    except Exception:
                        # app_state or tts not ready
                        pass

                    # Determine current mode
                    try:
                        in_call_mode = app_state.is_call_mode()
                    except Exception:
                        in_call_mode = False

                    # Select thresholds based on mode
                    energy_thresh = self.call_energy_threshold if in_call_mode else self.speech_energy_threshold
                    silence_req = self.call_silence_chunks if in_call_mode else self.silence_chunks_required
                    min_speech = self.call_min_speech_chunks if in_call_mode else self.min_speech_chunks

                    # Post-TTS cooldown: ignore audio when IDLE shortly after TTS stops
                    # to prevent self-recognition from speaker tail echo, but NEVER discard active STATE_LISTENING user recording.
                    if not tts_speaking:
                        self._tts_bg_energy = self._tts_bg_energy * 0.88 + 0.005 * 0.12
                        if self._tts_stop_time > 0 and (time.time() - self._tts_stop_time) < self.post_tts_cooldown:
                            if self.state == self.STATE_IDLE and energy < 0.022:
                                continue

                    # Track when TTS stops for cooldown
                    if tts_speaking:
                        self._tts_stop_time = 0.0
                        self.active_recording_had_tts = True # Mark that this recording overlap with TTS
                    elif self._tts_stop_time == 0.0:
                        self._tts_stop_time = time.time()

                    # When TTS is speaking: interrupt on sustained human speech over speaker output (only in Call Mode)
                    if tts_speaking and self.state != self.STATE_LISTENING:
                        if not in_call_mode:
                            continue
                        energy = self._get_chunk_energy(chunk)
                        # Adaptively track speaker output echo baseline
                        self._tts_bg_energy = self._tts_bg_energy * 0.85 + energy * 0.15
                        # Dynamic interruption threshold set above speaker output echo floor
                        thresh = max(0.020, self._tts_bg_energy * 1.75)
                        if energy > thresh:
                            self.interrupt_speech_counter += 1
                        else:
                            self.interrupt_speech_counter = 0

                        # Fire interruption on 2 consecutive chunks (500ms of sustained human voice over TTS)
                        if self.interrupt_speech_counter >= 2:
                            logger.info(
                                "[WakeWord] Instant speech onset interruption triggered (energy=%.5f > thresh=%.5f). Stopping TTS & LLM...",
                                energy, thresh
                            )
                            self.interrupt_speech_counter = 0
                            self.tts_buffer = []
                            self.tts_buffer_samples = 0
                            app_state.external_tts_speaking = False
                            try:
                                tts.stop_all()
                            except Exception:
                                pass
                            if app_state.main_loop:
                                asyncio.run_coroutine_threadsafe(
                                    app_state.notify_interruption(),
                                    app_state.main_loop
                                )
                            self._set_state(self.STATE_LISTENING)
                            self.speech_buffer = [chunk]
                            self.speech_chunk_count = 1
                            self.silence_counter = 0
                            self.recorded_samples = len(chunk)
                            continue
                        else:
                            continue
                        # During TTS, accumulate audio and detect energy spike (user speaking).
                        # Once we have enough samples OR an energy spike, send for transcription.
                        energy = self._get_chunk_energy(chunk)
                        self.tts_buffer.append(chunk)
                        self.tts_buffer_samples += len(chunk)
                        # Estimate TTS background energy from recent chunks
                        self._tts_bg_energy = self._tts_bg_energy * 0.95 + energy * 0.05
                        spike = energy > self._tts_bg_energy * 2.5 and energy > 0.01
                        enough_samples = self.tts_buffer_samples >= self.sample_rate * 1.5
                        if spike or enough_samples:
                            audio = np.concatenate(self.tts_buffer)
                            self.tts_buffer = []
                            self.tts_buffer_samples = 0
                            try:
                                self._seq_counter += 1
                                self.processing_queue.put_nowait(
                                    (audio, False, True, time.time(), self._seq_counter)
                                )
                            except queue.Full:
                                pass
                        continue

                    energy = self._get_chunk_energy(chunk)
                    is_speech = energy > energy_thresh

                    if self.state == self.STATE_IDLE:
                        self.ring_buffer.append(chunk)
                        if energy > energy_thresh:
                            self._set_state(self.STATE_LISTENING)
                            self.speech_buffer = list(self.ring_buffer)
                            self.ring_buffer.clear()
                            self.speech_chunk_count = 1
                            self.silence_counter = 0
                            self.recorded_samples = sum(len(c) for c in self.speech_buffer)
                            logger.info("[WakeWord] Speech detected (energy=%.5f > %.5f), recording...", energy, energy_thresh)

                    elif self.state == self.STATE_LISTENING:
                        self.speech_buffer.append(chunk)
                        self.recorded_samples += len(chunk)

                        if is_speech:
                            self.speech_chunk_count += 1
                            self.silence_counter = 0

                            # Sustained speech confirmed during active TTS playback. Stop TTS & notify interruption
                            if self.speech_chunk_count == 2 and tts_speaking and app_state.main_loop:
                                asyncio.run_coroutine_threadsafe(
                                    app_state.notify_interruption(),
                                    app_state.main_loop
                                )

                            # Real-time/Partial transcription:
                            # Every ~500ms (2 chunks of 250ms), try a partial transcription
                            # More aggressive partials improve wake word response time
                            if (
                                len(self.speech_buffer) % 2 == 0
                                and len(self.speech_buffer) >= 2
                            ):
                                self._enqueue_partial_recording()
                        else:
                            self.silence_counter += 1

                        # Check if recording is too long (safety limit)
                        recording_duration = self.recorded_samples / self.sample_rate

                        if recording_duration >= self.max_recording_duration:
                            logger.debug(
                                f"[WakeWord] Max recording duration reached ({recording_duration:.1f}s). Processing..."
                            )
                            self._set_state(self.STATE_PROCESSING)

                        # Check if enough silence has passed to consider speech ended
                        elif self.silence_counter >= silence_req:
                            if self.speech_chunk_count >= min_speech or self.active_recording_had_tts or in_call_mode:
                                logger.debug(
                                    f"[WakeWord] Speech ended. "
                                    f"Duration: {recording_duration:.1f}s, "
                                    f"Speech chunks: {self.speech_chunk_count}"
                                )
                                self._set_state(self.STATE_PROCESSING)
                            else:
                                # Too short, probably just noise
                                logger.debug(
                                    "[WakeWord] Too short, ignoring noise burst."
                                )
                                self._reset_state()

                    if self.state == self.STATE_PROCESSING:
                        if in_call_mode and self.speech_chunk_count >= 2:
                            self._play_feedback("success")  # Soft feedback chime on real speech sentences in Call Mode
                        self._enqueue_recording()
                        self._reset_state(silent=True)

        except Exception as e:
            logger.error(f"[WakeWord] Fatal microphone error: {e}")
            self.running = False

    def _reset_state(self, silent=False):
        """Reset state machine variables, optionally keeping the current state."""
        if not silent:
            self._set_state(self.STATE_IDLE)
        self.speech_buffer = []
        self.speech_chunk_count = 0
        self.silence_counter = 0
        self.recorded_samples = 0
        self.active_recording_had_tts = False

    def flush_buffers(self):
        """Clears all pending audio data and resets the state machine.
        Call this when entering call mode to discard any speech captured before activation."""
        # Clear the audio input queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
        # Clear the processing queue
        while not self.processing_queue.empty():
            try:
                self.processing_queue.get_nowait()
            except queue.Empty:
                break
        # Reset the state machine
        self.tts_buffer = []
        self.tts_buffer_samples = 0
        self._tts_bg_energy = 0.005
        self._reset_state()
        logger.debug("[WakeWord] Buffers flushed.")

    def _enqueue_recording(self):
        """Queue recorded audio for transcription without blocking capture."""
        if not self.speech_buffer:
            return

        audio = np.concatenate(self.speech_buffer)
        had_tts = self.active_recording_had_tts
        try:
            self._seq_counter += 1
            self.processing_queue.put_nowait((audio, False, had_tts, time.time(), self._seq_counter))  # False = Not partial
        except queue.Full:
            try:
                self.processing_queue.get_nowait()
                self._seq_counter += 1
                self.processing_queue.put_nowait((audio, False, had_tts, time.time(), self._seq_counter))
            except Exception:
                # Processing queue full and clear failed
                pass

    def _enqueue_partial_recording(self):
        """Queue partial audio for real-time feedback."""
        try:
            if app_state.is_call_mode():
                return  # Skip partial transcriptions in Call Mode to keep queue clean & instant
        except Exception:
            pass

        if not self.speech_buffer or len(self.speech_buffer) < 4:
            return

        audio = np.concatenate(self.speech_buffer)
        had_tts = self.active_recording_had_tts
        try:
            # We don't want to overflow the queue with partials, so we use a non-blocking put
            # and if it's full we just skip this partial (the next one will come soon)
            self._seq_counter += 1
            self.processing_queue.put_nowait((audio, True, had_tts, time.time(), self._seq_counter))  # True = Partial
        except queue.Full:
            pass

    def _processing_loop(self):
        """Background transcription loop."""
        while self.running or not self.processing_queue.empty():
            try:
                audio_data = self.processing_queue.get(timeout=0.5)
                # handle legacy tuple layouts for robustness
                if len(audio_data) == 5:
                    audio, is_partial, had_tts, enqueued_at, seq = audio_data
                elif len(audio_data) == 3:
                    audio, is_partial, had_tts = audio_data
                    enqueued_at, seq = time.time(), 0
                else:
                    audio, is_partial = audio_data
                    had_tts = False
                    enqueued_at, seq = time.time(), 0
            except queue.Empty:
                continue

            # Drop stale transcriptions that sat in queue too long.
            if (time.time() - enqueued_at) > 2.5:
                logger.warning("[WakeWord] Dropping stale audio from processing queue (age=%.1fs)", time.time() - enqueued_at)
                if not is_partial:
                    self._set_state(self.STATE_IDLE)
                continue

            if not is_partial:
                self._set_state(self.STATE_PROCESSING)

            try:
                self._process_recording(audio, is_partial, had_tts)
            finally:
                if not is_partial:
                    self._set_state(self.STATE_IDLE)

    def _process_recording(self, audio, is_partial=False, had_tts=False):
        """Transcribe the recorded speech buffer and process the result."""
        if audio is None or len(audio) == 0:
            return

        duration = len(audio) / self.sample_rate
        logger.debug(
            f"[WakeWord] Transcribing {duration:.1f}s of audio (partial={is_partial}, had_tts={had_tts})..."
        )

        try:
            # Optimized parameters for accuracy and low latency
            # Disable VAD in Call Mode or when TTS was speaking, so Whisper never incorrectly drops user speech.
            in_call = False
            try:
                in_call = app_state.is_call_mode()
            except Exception:
                pass

            use_vad = not had_tts and not in_call
            prompt = None if in_call else "Luna. MomAI. Assistente virtual."

            segments, info = self.model.transcribe(
                audio,
                language="pt",
                beam_size=1,
                best_of=1,
                initial_prompt=prompt,
                vad_filter=use_vad,
                vad_parameters=dict(
                    min_silence_duration_ms=400 if use_vad else 0,
                    speech_pad_ms=250 if use_vad else 0,
                    threshold=0.3 if use_vad else 0.0,
                ),
                no_speech_threshold=0.6 if use_vad else None,
                log_prob_threshold=-1.0 if use_vad else None,
                condition_on_previous_text=False,
                suppress_blank=True,
            )

            raw_text = "".join([s.text for s in segments]).strip()

            if not raw_text:
                logger.warning("[WakeWord] Whisper returned empty transcription (duration=%.1fs, in_call=%s)", duration, in_call)
                return

            # Clean text from Whisper artifacts and punctuation
            text = re.sub(r"[^\w\s]", "", raw_text).lower().strip()
            # Remove extra whitespace
            text = re.sub(r"\s+", " ", text)

            if not text or len(text) < 2:
                return

            # Filter out common Whisper hallucinations
            hallucinations = [
                "obrigado",
                "legendado",
                "legenda",
                "legendas",
                "inscreva",
                "inscrever",
                "subscribe",
                "obrigada",
                "tchau",
                "até",
                "continue assistindo",
                "thank you",
                "thanks for watching",
                "hmmm",
                "hum",
                "ah",
                "oh",
                "silêncio",
            ]
            text_lower = text.lower()
            if any(h == text_lower for h in hallucinations):  # Exact match for short hallucinations
                logger.debug(f"[WakeWord] Filtered hallucination: '{text}'")
                return

            # Check for repetitive text (another hallucination pattern)
            words = text.split()
            if len(words) >= 4:
                unique_words = set(words)
                if len(unique_words) <= 2:
                    logger.debug(f"[WakeWord] Filtered repetitive text: '{text}'")
                    return

            now = time.time()
            is_repeat = (
                text == self.last_text
                and (now - self.last_text_time) < self.text_repeat_cooldown
            )

            if is_partial:
                if self.partial_callback:
                    # Don't show partials if they are just the assistant's own voice
                    if not had_tts or (self.bypass_condition and self.bypass_condition()):
                        self.partial_callback(raw_text)
                
                # During TTS, partial transcriptions from the sliding buffer need
                # a wake word check to allow "Luna" to interrupt the assistant.
                if had_tts and self._check_wake_word_fuzzy(raw_text):
                    return  # wake word handled inside _check_wake_word_fuzzy (stops TTS etc.)
                
                # For non-TTS partials, return early to avoid premature triggering.
                return

            if not is_repeat:
                t_transcribe_end = time.time()
                logger.info(f"[WakeWord][VoiceLatency] Transcribed in {(t_transcribe_end - now):.3f}s: '{raw_text}'")
                self._handle_transcription(text, raw_text, had_tts)
                self.last_text = text
                self.last_text_time = now

        except Exception as e:
            logger.error(f"[WakeWord] Transcription error: {e}")

    def _play_feedback(self, sound_type):
        """Plays a high-quality, soft feedback sound."""
        try:
            # Common parameters
            sr = self.sample_rate

            tone = None

            if sound_type == "start_listening":
                # Subtle "pop" or "breath" (not currently used)
                duration = 0.15
                t = np.linspace(0, duration, int(sr * duration), False)
                freq = 440
                tone = 0.1 * np.sin(2 * np.pi * freq * t) * np.exp(-15 * t)

            elif sound_type == "stop_listening":
                # Subtle low "thump"
                duration = 0.15
                t = np.linspace(0, duration, int(sr * duration), False)
                freq = 300
                tone = 0.1 * np.sin(2 * np.pi * freq * t) * np.exp(-20 * t)

            elif sound_type == "success":
                # Modern "Glassy" Chime (C Major 7th ish feel)
                duration = 0.6
                t = np.linspace(0, duration, int(sr * duration), False)

                # Frequencies: C5, E5, G5 (C Major Triad) + C6 (Octave)
                f1, f2, f3, f4 = 523.25, 659.25, 783.99, 1046.50

                # Mix with exponential decay
                v1 = np.sin(2 * np.pi * f1 * t) * np.exp(-8 * t)
                v2 = np.sin(2 * np.pi * f2 * t) * np.exp(-10 * t)
                v3 = np.sin(2 * np.pi * f3 * t) * np.exp(-12 * t)
                v4 = np.sin(2 * np.pi * f4 * t) * np.exp(-14 * t) * 0.4

                tone = (v1 + 0.8 * v2 + 0.8 * v3 + 0.5 * v4) * 0.08

            if tone is not None:
                fade_in = min(50, len(tone))
                tone[:fade_in] *= np.linspace(0, 1, fade_in)
                audio = tone.astype(np.float32)
                sd.play(audio, samplerate=sr)
        except Exception:
            logger.debug("[WakeWord] Feedback sound playback failed", exc_info=True)

    def _stop_tts(self):
        """Stop any ongoing TTS playback."""
        try:
            if tts.is_speaking():
                logger.debug("[WakeWord] Interruption! Stopping TTS.")
                tts.stop_all()
        except Exception:
            logger.debug("[WakeWord] Failed to stop TTS", exc_info=True)

    def _check_wake_word_fuzzy(self, text: str) -> bool:
        """Quick check if text contains a wake word (exact or fuzzy)."""
        for kw in self.variants:
            if re.search(rf"\b{re.escape(kw)}\b", text):
                return True
        # Fuzzy matching for common Whisper mistranscriptions
        words = text.split()
        for word in words:
            if len(word) < 2 or len(word) > 8:
                continue
            for kw in self.variants:
                ratio = fuzz.ratio(word, kw) / 100.0
                if ratio >= 0.70:
                    return True
        return False

    def _handle_transcription(self, text, raw_text, had_tts=False):
        """Processes a complete transcription to find the keyword or handle bypass."""
        now = time.time()

        # Determine current mode for context
        try:
            in_call_mode = self.bypass_condition and self.bypass_condition()
        except:
            in_call_mode = False

        # Keyword detection with variants + fuzzy phonetic matching
        detected_variation = None
        match = None

        # 1. Exact match first (fastest)
        for kw in self.variants:
            keyword_pattern = rf"\b{re.escape(kw)}\b"
            m = re.search(keyword_pattern, text)
            if m:
                detected_variation = m.group(0)
                match = m
                break

        # 2. Fuzzy matching for common Whisper mistranscriptions of "Luna"
        if not detected_variation:
            blacklist = ["lula", "tuna", "duna", "lua", "una", "luta", "lupa", "tuta", "puna"]
            fuzzy_variants = [
                "luma", "lunna",
            ]
            words = text.split()
            for i, word in enumerate(words):
                if word in blacklist:
                    continue
                if word in fuzzy_variants:
                    detected_variation = word
                    match = re.search(re.escape(word), text)
                    logger.debug(f"[WakeWord] Fuzzy match: '{word}' recognized as wake word")
                    break
                # Also try SequenceMatcher for words very close to "luna"
                # Increased threshold to 0.88 and min length 4 to avoid "lula", "tuna", etc.
                if len(word) >= 4 and len(word) <= 8:
                    for kw in self.variants:
                        ratio = fuzz.ratio(word, kw) / 100.0
                        # Strict matching: 0.88 ensures for 4-letter words it must be a 100% match
                        if ratio >= 0.88:
                            detected_variation = word
                            match = re.search(re.escape(word), text)
                            logger.debug(
                                f"[WakeWord] Fuzzy similarity match: '{word}' ~ '{kw}' "
                                f"(ratio={ratio:.2f})"
                            )
                            break
                    if detected_variation:
                        break
                if detected_variation:
                    break

        if detected_variation:
            if not self.wake_word_active:
                return
            if (now - self.last_trigger_time) < self.trigger_cooldown:
                return

            self.last_trigger_time = now
            self._stop_tts()
            self._play_feedback("success")  # Feedback sound immediately!

            # Clean and extract command: only text AFTER the keyword
            # e.g. "teste luna bom dia" → "bom dia"
            keyword_end_pos = match.end()
            command_clean = text[keyword_end_pos:].strip()

            # Reconstruct clean command from raw text preserving punctuation/casing
            # Find the keyword position in the raw text and take everything after it
            raw_lower = raw_text.lower()
            raw_match = re.search(rf"\b{re.escape(detected_variation)}\b", raw_lower)
            if raw_match:
                final_cmd = raw_text[raw_match.end():].strip()
                # Remove leading punctuation commonly added by Whisper
                final_cmd = re.sub(r"^[^\w\s]+", "", final_cmd).strip()
            else:
                final_cmd = command_clean

            logger.info("[WakeWord] Detected: cmd='%s' match='%s'", final_cmd, detected_variation)

            if self.callback:
                # Small sleep to let the chime start before the UI reacts
                time.sleep(0.1)
                self.callback(final_cmd)
            self.flush_buffers()
            return

        # NEW Logic: If TTS was active during this recording AND no wake word was found,
        # we strictly block keyword/bypass routing unless in call mode.
        # This prevents the assistant from triggering its own skills.
        if had_tts and not in_call_mode:
            logger.debug("[WakeWord] Blocking keyword/bypass check: audio captured during TTS in normal mode")
            return

        # 1.5. Keyword check: if text matches a skill keyword, route as command
        if self.keyword_check_url:
            if (now - self._last_keyword_time) < self.trigger_cooldown:
                logger.debug("[WakeWord] Keyword check skipped (cooldown)")
            else:
                logger.debug("[WakeWord] Keyword check URL=%s text='%s'", self.keyword_check_url, raw_text)
                try:
                    import httpx
                    import os
                    token = os.getenv("MOMAI_SESSION_TOKEN", "")
                    headers = {"Authorization": f"Bearer {token}"} if token else {}
                    with httpx.Client() as client:
                        resp = client.get(
                            self.keyword_check_url,
                            params={"text": raw_text},
                            headers=headers,
                            timeout=2.0,
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            if data.get("matched"):
                                logger.info(
                                    "[WakeWord] Keyword matched skill '%s': '%s'",
                                    data.get("skillId"), raw_text,
                                )
                                self._stop_tts()
                                self._last_keyword_time = now
                                self.last_trigger_time = now
                                if self.callback:
                                    self.callback(raw_text)
                                self.flush_buffers()
                                return
                except Exception as exc:
                    logger.debug("[WakeWord] Keyword check failed: %s", exc)
        else:
            logger.debug("[WakeWord] No keyword_check_url configured, skipping keyword check")

        # 2. Bypass Mode (Only if keyword NOT detected)
        if self.bypass_condition and self.bypass_condition():
            # Stricter filtering in call mode to avoid false triggers
            # Min length 2 allows "Oi", "Sim", "Não"
            if len(text) < 2 or (now - self.last_trigger_time) < self.trigger_cooldown:
                if len(text) < 2:
                    logger.debug(f"[WakeWord] Call mode: ignoring too-short text: '{text}'")
                return

            # Reject text that is ONLY a known hallucination pattern
            call_hallucinations = [
                "obrigado", "legendado", "legenda", "legendas",
                "inscreva", "inscrever", "subscribe", "obrigada",
                "tchau", "ate", "continue assistindo", "thank you",
                "thanks for watching", "hum", "hmm", "ah", "oh",
            ]
            if text.strip() in call_hallucinations:
                logger.debug(f"[WakeWord] Call mode: filtered hallucination: '{text}'")
                return

            logger.debug(
                f"[WakeWord] Bypass active (conversation). Message: '{raw_text}'"
            )
            self._stop_tts()
            self.last_trigger_time = now
            if self.callback:
                self.callback(raw_text)
            self.flush_buffers()
            return

    def start(self):
        """Start the detector in a background thread."""
        with self.lock:
            if not self.running:
                if not self._load_model():
                    logger.warning("[WakeWord] Detector will not start yet (model not ready).")
                    return
                if not HAS_SOUNDDEVICE:
                    logger.warning(
                        "[WakeWord] Sounddevice not available. Detector will not start."
                    )
                    return
                self.running = True
                self.processing_thread = threading.Thread(
                    target=self._processing_loop, daemon=True
                )
                self.thread = threading.Thread(target=self._listen_loop, daemon=True)
                self.processing_thread.start()
                self.thread.start()

    def stop(self):
        """Stop the detector."""
        self.running = False
        self._stop_event.set()
        if self.thread:
            self.thread.join(timeout=1)
        if self.processing_thread:
            self.processing_thread.join(timeout=1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    detector = WakeWordDetector(callback=lambda t: logger.info(f"> {t}"))
    detector.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        detector.stop()
