import numpy as np
import threading
import queue
import time
import logging
import re

logger = logging.getLogger("momai.voice.whatsapp_reply")

try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except OSError:
    HAS_SOUNDDEVICE = False
    sd = None

WAKE_WORDS = ["responda", "responde"]


class WhatsAppReplyDetector:
    """
    Detecta 'responda' no audio e captura a resposta para reply do WhatsApp.

    Funciona em 3 fases:
    1. WAITING: grava audio, checa 'responda' via Whisper periodico
    2. DETECTED: 'responda' ouvido, continua gravando ate silencio
    3. COMPLETE: transcreve audio completo, extrai texto apos 'responda'

    Uso:
        detector = WhatsAppReplyDetector(model, on_result=fn, on_status=fn)
        detector.start(contact_jid="...")
        # aguarda... callbacks sao chamados quando pronto
        detector.stop()
    """

    STATE_IDLE = "idle"
    STATE_LISTENING = "listening"
    STATE_DETECTED = "detected"
    STATE_TRANSCRIBING = "transcribing"
    STATE_COMPLETE = "complete"
    STATE_ERROR = "error"
    STATE_TIMEOUT = "timeout"

    def __init__(self, model, sample_rate=16000, on_result=None, on_status=None):
        self.model = model
        self.sample_rate = sample_rate
        self.on_result = on_result
        self.on_status = on_status

        self.running = False
        self.stop_requested = False
        self.thread = None
        self.contact_jid = None

        self.blocksize = 2000
        self.speech_threshold = 0.015
        self.silence_chunks_required = 10
        self.silence_timeout_chunks = 160
        self.max_duration = 45.0
        self.detect_interval = 8
        self.rolling_window_size = 24000

    def start(self, contact_jid: str):
        if self.running:
            return
        self.contact_jid = contact_jid
        self.stop_requested = False
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_requested = True
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5.0)
        self.running = False

    def _run(self):
        if not HAS_SOUNDDEVICE:
            logger.warning("[WhatsAppReply] sounddevice not available")
            self._emit_status(self.STATE_ERROR)
            return

        logger.debug("[WhatsAppReply] Detector started, listening for 'responda'")
        self._emit_status(self.STATE_LISTENING)

        audio_buffer = []
        silence_counter = 0
        continuous_silence = 0
        speech_chunk_count = 0
        wake_word_detected = False
        chunk_counter = 0
        audio_queue = queue.Queue()
        start_time = time.time()
        stop_event = threading.Event()

        def _callback(indata, frames, time_info, status):
            if status:
                s = str(status)
                if "overflow" not in s.lower():
                    logger.warning(f"[WhatsAppReply] Audio status: {s}")
            try:
                audio_queue.put_nowait(np.array(indata, dtype=np.float32).flatten())
            except queue.Full:
                try:
                    audio_queue.get_nowait()
                    audio_queue.put_nowait(np.array(indata, dtype=np.float32).flatten())
                except Exception:
                    pass
            if stop_event.is_set():
                raise sd.CallbackStop

        try:
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                blocksize=self.blocksize,
                callback=_callback,
            ):
                while not self.stop_requested and not stop_event.is_set():
                    try:
                        chunk = audio_queue.get(timeout=0.1)
                        audio_buffer.append(chunk)
                        chunk_counter += 1

                        energy = np.sqrt(np.mean(chunk ** 2))
                        is_speech = energy > self.speech_threshold

                        if is_speech:
                            speech_chunk_count += 1
                            silence_counter = 0
                            continuous_silence = 0
                        else:
                            silence_counter += 1
                            continuous_silence += 1

                        if not wake_word_detected and chunk_counter % self.detect_interval == 0:
                            if len(audio_buffer) >= 8:
                                recent = audio_buffer[-24:] if len(audio_buffer) > 24 else audio_buffer
                                window = np.concatenate(recent)
                                if self._check_wake_word(window):
                                    wake_word_detected = True
                                    logger.debug("[WhatsAppReply] Wake word detected")
                                    self._emit_status(self.STATE_DETECTED)

                        if wake_word_detected:
                            if silence_counter >= self.silence_chunks_required and speech_chunk_count >= 1:
                                logger.debug("[WhatsAppReply] Silence after wake word, stopping")
                                stop_event.set()
                                break
                        else:
                            if continuous_silence >= self.silence_timeout_chunks:
                                logger.debug("[WhatsAppReply] Silence timeout, no wake word")
                                self._emit_status(self.STATE_TIMEOUT)
                                stop_event.set()
                                break
                            if time.time() - start_time > self.max_duration:
                                logger.debug("[WhatsAppReply] Max duration reached, no wake word")
                                self._emit_status(self.STATE_TIMEOUT)
                                stop_event.set()
                                break

                    except queue.Empty:
                        continuous_silence += 1
                        if continuous_silence >= self.silence_timeout_chunks:
                            logger.debug("[WhatsAppReply] Silence timeout (queue empty)")
                            self._emit_status(self.STATE_TIMEOUT)
                            stop_event.set()
                            break
                        if time.time() - start_time > self.max_duration + 2:
                            stop_event.set()
                            break
                        continue

        except Exception as e:
            logger.error(f"[WhatsAppReply] Recording error: {e}")
            self._emit_status(self.STATE_ERROR)
            return
        finally:
            self.running = False

        if not audio_buffer:
            logger.debug("[WhatsAppReply] No audio captured")
            return
        if not wake_word_detected:
            logger.debug("[WhatsAppReply] No wake word detected in any check")
            return

        try:
            self._emit_status(self.STATE_TRANSCRIBING)
            audio = np.concatenate(audio_buffer)
            duration = len(audio) / self.sample_rate
            logger.debug(f"[WhatsAppReply] Transcribing {duration:.1f}s of audio")

            segments, _ = self.model.transcribe(
                audio,
                language="pt",
                beam_size=1,
                best_of=1,
                patience=1,
                condition_on_previous_text=False,
            )
            full_text = " ".join(s.text for s in segments).strip().lower()
            logger.debug(f"[WhatsAppReply] Full transcription: '{full_text[:120]}'")

            reply = self._extract_reply(full_text)

            if reply:
                logger.info(f"[WhatsAppReply] Reply: '{reply}'")
                if self.on_result:
                    self.on_result(reply, self.contact_jid)
                self._emit_status(self.STATE_COMPLETE)
            else:
                logger.debug(f"[WhatsAppReply] No reply in: '{full_text}'")
                self._emit_status(self.STATE_IDLE)

        except Exception as e:
            logger.error(f"[WhatsAppReply] Transcription error: {e}")
            self._emit_status(self.STATE_ERROR)

    def _check_wake_word(self, audio: np.ndarray) -> bool:
        try:
            segments, _ = self.model.transcribe(
                audio,
                language="pt",
                beam_size=1,
                best_of=1,
                condition_on_previous_text=False,
            )
            text = " ".join(s.text for s in segments).strip().lower()
            logger.debug(f"[WhatsAppReply] Wake word check: '{text[:80]}'")
            for ww in WAKE_WORDS:
                if ww in text:
                    logger.debug(f"[WhatsAppReply] Found '{ww}' in transcription")
                    return True
            return False
        except Exception as e:
            logger.debug(f"[WhatsAppReply] Wake word check error: {e}")
            return False

    def _extract_reply(self, text: str) -> str:
        text_lower = text.lower()
        for ww in WAKE_WORDS:
            if ww in text_lower:
                idx = text_lower.index(ww) + len(ww)
                reply = text[idx:].strip()
                reply = re.sub(r'^[\s,.;:!?\-]+', '', reply).strip()
                if reply:
                    return reply
        return ""

    def _emit_status(self, status: str):
        if self.on_status:
            try:
                self.on_status(status)
            except Exception:
                pass
