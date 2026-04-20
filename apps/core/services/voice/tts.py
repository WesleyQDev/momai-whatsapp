import warnings
import threading
import time
import logging
import queue
import asyncio
import io
import re
import sys
import os
import platform
from typing import Optional, Any

# Heavy imports deferred for faster startup
sd = None
np = None
HAS_SOUNDDEVICE = None

os.environ["TOKENIZERS_PARALLELISM"] = "false"

warnings.filterwarnings("ignore", category=UserWarning)

logger = logging.getLogger("momai.tts")

ONNX_PROVIDER = "CPUExecutionProvider"
IS_LINUX = platform.system().lower() == "linux"

VIRTUAL_DEVICE_KEYWORDS = [
    "elgato", "virtual", "voicemeeter", "cable", "vb-audio",
    "steelseries sonar", "nahimic", "sonic studio",
]

PHYSICAL_DEVICE_KEYWORDS = [
    "realtek", "speakers", "headphone", "alto-falante",
    "high definition audio", "usb audio",
]


def _ensure_tts_imports():
    """Lazy-load heavy TTS dependencies."""
    global sd, np, HAS_SOUNDDEVICE, ONNX_PROVIDER
    if np is not None:
        return

    import numpy as _np

    np = _np

    try:
        import sounddevice as _sd

        sd = _sd
        HAS_SOUNDDEVICE = True
    except OSError:
        HAS_SOUNDDEVICE = False

    try:
        import onnxruntime

        if "CUDAExecutionProvider" in onnxruntime.get_available_providers():
            ONNX_PROVIDER = "CUDAExecutionProvider"
            logger.info("[TTS] Using GPU acceleration for TTS")
    except Exception as e:
        logger.debug(f"[TTS] GPU check error: {e}")


LANG_CODE_MAP = {
    "p": "pt-br",
    "a": "en-us",
    "b": "en-gb",
    "e": "es",
    "i": "it",
    "f": "fr",
    "j": "ja",
    "z": "zh",
    "h": "hi",
}

VOICE_PREFIX_MAP = {
    "pf": ("pt-br", "female"),
    "pm": ("pt-br", "male"),
    "af": ("en-us", "female"),
    "am": ("en-us", "male"),
    "bf": ("en-gb", "female"),
    "bm": ("en-gb", "male"),
    "ef": ("es", "female"),
    "em": ("es", "male"),
    "if": ("it", "female"),
    "im": ("it", "male"),
    "ff": ("fr", "female"),
    "jf": ("ja", "female"),
    "jm": ("ja", "male"),
    "zf": ("zh", "female"),
    "zm": ("zh", "male"),
    "hf": ("hi", "female"),
    "hm": ("hi", "male"),
}

DEFAULT_VOICE = "pf_dora"
DEFAULT_LANG = "p"


def _find_output_device() -> tuple[Optional[int], int]:
    """Find a suitable physical audio output device.

    Returns (device_index, native_samplerate).  device_index may be ``None``
    when no better device than the system default can be found.
    """
    _ensure_tts_imports()
    if not HAS_SOUNDDEVICE:
        return None, 24000

    try:
        devices = sd.query_devices()
    except Exception:
        return None, 24000

    default_idx = sd.default.device[1]
    default_dev = sd.query_devices(default_idx) if default_idx is not None else None

    # Check if default device is virtual
    default_name = (default_dev["name"] if default_dev else "").lower()
    is_default_virtual = any(kw in default_name for kw in VIRTUAL_DEVICE_KEYWORDS)

    if not is_default_virtual:
        sr = int(default_dev["default_samplerate"]) if default_dev else 24000
        logger.info(f"[TTS] Using default output device: [{default_idx}] {default_dev['name']} @ {sr}Hz")
        return None, sr

    logger.warning(
        f"[TTS] Default output device is virtual: [{default_idx}] {default_name}. "
        "Searching for a physical device..."
    )

    # Try to find a physical device
    best: Optional[tuple[int, dict]] = None
    for i, d in enumerate(devices):
        if d.get("max_output_channels", 0) == 0:
            continue
        name_lower = d["name"].lower()
        if any(kw in name_lower for kw in VIRTUAL_DEVICE_KEYWORDS):
            continue
        if any(kw in name_lower for kw in PHYSICAL_DEVICE_KEYWORDS):
            best = (i, d)
            break
        if best is None:
            best = (i, d)

    if best:
        idx, dev = best
        sr = int(dev["default_samplerate"])
        logger.info(f"[TTS] Selected physical output device: [{idx}] {dev['name']} @ {sr}Hz")
        return idx, sr

    sr = int(default_dev["default_samplerate"]) if default_dev else 24000
    logger.warning("[TTS] No physical device found, falling back to default.")
    return None, sr


def _resample(audio: Any, src_sr: int, dst_sr: int) -> Any:
    """Resample float32 audio from src_sr to dst_sr using linear interpolation."""
    if src_sr == dst_sr:
        return audio
    _ensure_tts_imports()
    ratio = dst_sr / src_sr
    n_out = int(len(audio) * ratio)
    indices = np.linspace(0, len(audio) - 1, n_out)
    return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)


class TTSManager:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(TTSManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "initialized"):
            return

        self.initialized = True
        self.voice = DEFAULT_VOICE
        self.lang_code = DEFAULT_LANG
        self.enabled = True
        self.text_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.ready_event = threading.Event()
        self.has_tts = False
        self._error = None

        self.session_id = 0
        self.state_lock = threading.Lock()
        self.start_lock = threading.Lock()

        self.worker_thread: Optional[threading.Thread] = None
        self.active_stream = None
        self.kokoro = None
        self._is_playing = False
        self.on_speech_start = None
        self.on_speech_stop = None
        self._initializing = False

    def initialize(self):
        """Manually starts the Kokoro initialization thread."""
        with self.start_lock:
            if self.kokoro or self._initializing:
                return
            self._initializing = True
            threading.Thread(target=self._initialize_kokoro, daemon=True).start()

    def _initialize_kokoro(self):
        """Initializes the TTS pipeline using kokoro-onnx."""
        _ensure_tts_imports()
        try:
            logger.debug("[TTS] Loading Kokoro-ONNX...")

            from kokoro_onnx import Kokoro
            import onnxruntime as ort

            model_dir = os.path.join(os.path.dirname(__file__), "models")
            os.makedirs(model_dir, exist_ok=True)

            model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
            voices_path = os.path.join(model_dir, "voices-v1.0.bin")

            if not os.path.exists(model_path):
                logger.info("[TTS] Downloading Kokoro model...")
                try:
                    import urllib.request

                    url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
                    logger.info(f"[TTS] Downloading model from {url}...")
                    urllib.request.urlretrieve(url, model_path)
                    logger.info("[TTS] Model download complete.")
                except Exception as e:
                    logger.warning(
                        f"[TTS] GitHub download failed for model: {e}, trying HuggingFace..."
                    )
                    from huggingface_hub import hf_hub_download

                    model_path = hf_hub_download(
                        repo_id="adrianlyjak/kokoro-onnx",
                        filename="kokoro-v1.0.onnx",
                        local_dir=model_dir,
                    )

            if not os.path.exists(voices_path):
                logger.info("[TTS] Downloading voices file...")
                try:
                    import urllib.request

                    url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
                    logger.info(f"[TTS] Downloading voices from {url}...")
                    urllib.request.urlretrieve(url, voices_path)
                    logger.info("[TTS] Voices download complete.")
                except Exception as e:
                    logger.warning(
                        f"[TTS] GitHub download failed for voices: {e}, trying HuggingFace..."
                    )
                    from huggingface_hub import hf_hub_download

                    voices_path = hf_hub_download(
                        repo_id="adrianlyjak/kokoro-onnx",
                        filename="voices-v1.0.bin",
                        local_dir=model_dir,
                    )

            providers = [ONNX_PROVIDER]
            if ONNX_PROVIDER == "CPUExecutionProvider":
                providers.append("CPUExecutionProvider")

            self.kokoro = Kokoro(model_path, voices_path)

            self.has_tts = True
            self.ready_event.set()
            logger.debug("✅ [TTS] Kokoro-ONNX ready!")

            # If any text arrived while initialization was running,
            # start the worker immediately so first utterance is not delayed.
            if not self.text_queue.empty():
                self.start()
        except Exception as e:
            self._error = str(e)
            self.has_tts = False
            self.ready_event.set()
            logger.error(f"❌ [TTS] Error loading Kokoro-ONNX: {e}")

    def _speech_worker(self):
        """Simple TTS worker: generates audio then plays with sd.play().

        Uses sd.play() instead of OutputStream for maximum compatibility.
        Processes one phrase at a time from the text queue.
        """
        self.ready_event.wait()

        if self._error or not self.has_tts:
            logger.warning(f"[TTS] Worker stopping: system unavailable ({self._error})")
            return

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        _ensure_tts_imports()
        device_sr = 24000
        if HAS_SOUNDDEVICE:
            try:
                default_idx = sd.default.device[1]
                default_dev = sd.query_devices(default_idx)
                device_sr = int(default_dev["default_samplerate"])
                logger.info(
                    f"[TTS Worker] Using default output: [{default_idx}] "
                    f"{default_dev['name']} @ {device_sr}Hz"
                )
            except Exception as e:
                logger.warning(f"[TTS Worker] Could not query default device: {e}")

        logger.info(
            f"[TTS Worker] Started (sr={device_sr}, sounddevice={HAS_SOUNDDEVICE})"
        )

        try:
            while not self.stop_event.is_set():
                try:
                    text = self.text_queue.get(timeout=0.3)
                except queue.Empty:
                    continue

                if text is None:
                    break

                with self.state_lock:
                    sid = self.session_id

                logger.info(f"[TTS Gen] Start: '{text[:40]}...' (Session {sid})")

                self._is_playing = True
                if self.on_speech_start:
                    self.on_speech_start()

                lang = LANG_CODE_MAP.get(self.lang_code, "en-us")
                all_chunks: list = []
                audio_sr = 24000

                try:
                    async def _generate_and_play():
                        nonlocal audio_sr
                        # Optimized speed for a more natural/gentle pace
                        # 0.95 is often perceived as more 'delicate' than 1.0
                        generation_speed = 0.95 
                        
                        stream = self.kokoro.create_stream(
                            text, voice=self.voice, speed=generation_speed, lang=lang
                        )
                        
                        playback_started = False
                        async for samples, sr in stream:
                            with self.state_lock:
                                # Check if we should still be playing this session
                                is_stale = self.session_id != sid or self.stop_event.is_set()
                                    
                            if is_stale:
                                # We continue the loop to 'drain' the generator and avoid pending tasks
                                # but we don't process or play the audio.
                                continue
                                
                            if samples is None or len(samples) == 0:
                                continue
                                
                            audio_sr = sr
                            audio_data = np.asarray(samples, dtype=np.float32)
                            
                            # Resample if needed
                            play_sr = device_sr if device_sr else int(audio_sr)
                            play_data = _resample(audio_data, int(audio_sr), play_sr)

                            # Apply a very subtle fade-out to avoid "immediate" endings
                            fade_len = int(play_sr * 0.15) # 150ms fade
                            if len(play_data) > fade_len:
                                fade_curve = np.linspace(1.0, 0.0, fade_len)
                                play_data[-fade_len:] *= fade_curve
                            
                            # Add 100ms of pure silence at the very end
                            silence_len = int(play_sr * 0.1)
                            play_data = np.concatenate([play_data, np.zeros(silence_len, dtype=np.float32)])

                            # Play this chunk immediately
                            if HAS_SOUNDDEVICE:
                                if not playback_started:
                                    logger.info(f"[TTS Stream] Starting playback for first chunk")
                                    playback_started = True
                                
                                sd.play(play_data, samplerate=play_sr)
                                
                                # Send frequency bands to UI for "mountainous" visualization
                                try:
                                    sub_chunks = np.array_split(play_data, 4)
                                    all_bands = []
                                    for sc in sub_chunks:
                                        fft_res = np.abs(np.fft.rfft(sc))
                                        bands = np.array_split(fft_res, 16)
                                        # Scale for UI visibility
                                        all_bands.append([float(np.mean(b)) * 20 for b in bands])
                                    
                                    if app_state.main_loop:
                                        asyncio.run_coroutine_threadsafe(
                                            app_state.broadcast_to_sockets({"type": "voice_bands", "bands": all_bands}),
                                            app_state.main_loop
                                        )
                                except Exception:
                                    pass
                                    
                                sd.wait() 
                            
                    loop.run_until_complete(_generate_and_play())
                except Exception as e:
                    logger.error(f"[TTS Stream Error] {e}")

                self._is_playing = False
                if self.on_speech_stop:
                    self.on_speech_stop()

                try:
                    self.text_queue.task_done()
                except ValueError:
                    pass

        except Exception as e:
            if not self.stop_event.is_set():
                logger.error(f"[TTS Worker] Error: {e}")
        finally:
            try:
                loop.close()
            except Exception:
                pass
            self.active_stream = None
            logger.debug("[TTS Worker] Thread finished.")

    def wait_until_ready(self, timeout: float = 30.0):
        """Waits for the TTS system to be ready."""
        if self.has_tts:
            return True
        return self.ready_event.wait(timeout)

    def start(self):
        """Starts the worker thread if necessary."""
        with self.start_lock:
            if not self.ready_event.is_set():
                logger.debug("[TTS] Waiting for initialization...")
                # Keep this very short; if still loading we return immediately
                # and _initialize_kokoro() will auto-start the worker when ready.
                if not self.ready_event.wait(timeout=0.15):
                    logger.debug(
                        "[TTS] Still initializing, will wait for first phrase."
                    )
                    return

            if self.worker_thread is not None:
                if self.worker_thread.is_alive():
                    # If it's stopping, wait briefly for it to exit
                    if self.stop_event.is_set():
                        self.worker_thread.join(timeout=0.5)
                    
                    if self.worker_thread.is_alive():
                        return

                logger.debug(
                    f"[TTS] Cleaning up dead thread: {self.worker_thread.name}"
                )
                self.worker_thread = None

            logger.debug("[TTS] Starting new worker thread...")
            self.stop_event.clear()

            new_thread = threading.Thread(
                target=self._speech_worker, daemon=True, name=f"TTS-Worker-{id(self)}"
            )

            try:
                new_thread.start()
                self.worker_thread = new_thread
                logger.debug(f"[TTS] Thread started successfully: {new_thread.name}")
            except RuntimeError as e:
                if "threads can only be started once" in str(
                    e
                ) or "started once" in str(e):
                    logger.warning(
                        f"[TTS] Thread start race condition intercepted: {e}"
                    )
                    self.worker_thread = new_thread
                else:
                    logger.error(f"[TTS] Thread start failed: {e}")
                    self.worker_thread = None
                    raise e

    def stop(self):
        """Stops playback and clears the queue."""
        with self.state_lock:
            self.session_id += 1

        # Reset playing flag immediately so is_speaking() returns False
        self._is_playing = False

        with self.start_lock:
            self.stop_event.set()

            _ensure_tts_imports()
            if HAS_SOUNDDEVICE:
                try:
                    sd.stop()
                except Exception:
                    pass

            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=2)

            self.worker_thread = None

        try:
            while not self.text_queue.empty():
                self.text_queue.get_nowait()
                self.text_queue.task_done()
        except Exception as e:
            logger.debug(f"[TTS] Queue clear error: {e}")

        logger.debug("[TTS] Playback stopped and queue cleared.")

    def set_voice(self, voice_name: str):
        """Sets the voice for Kokoro-ONNX."""
        if not voice_name:
            return

        legacy_map = {
            "pt-BR-FranciscaNeural": "pf_dora",
            "pt-BR-AntonioNeural": "pm_alex",
            "en-US-JennyNeural": "af_heart",
            "en-US-GuyNeural": "am_adam",
        }

        if voice_name in legacy_map:
            logger.info(
                f"[TTS] Mapping legacy voice '{voice_name}' to '{legacy_map[voice_name]}'"
            )
            voice_name = legacy_map[voice_name]

        if "_" not in voice_name:
            logger.warning(
                f"[TTS] Invalid voice format '{voice_name}'. Falling back to '{DEFAULT_VOICE}'"
            )
            voice_name = DEFAULT_VOICE

        self.voice = voice_name

        prefix = voice_name[:2]
        if prefix in VOICE_PREFIX_MAP:
            new_lang, _ = VOICE_PREFIX_MAP[prefix]
            lang_code = next(
                (k for k, v in LANG_CODE_MAP.items() if v == new_lang), "p"
            )
            if lang_code != self.lang_code:
                logger.info(
                    f"[TTS] Language changed to '{new_lang}' based on voice '{voice_name}'"
                )
                self.lang_code = lang_code

    def set_enabled(self, enabled: bool):
        """Enables or disables TTS."""
        self.enabled = enabled
        if not enabled:
            self.stop()

    def is_busy(self):
        """Checks if the system is currently speaking or has items in queue."""
        return self._is_playing or not self.text_queue.empty()

    @staticmethod
    def _strip_markdown(text: str) -> str:
        """Remove markdown formatting and emojis so TTS reads clean text."""
        s = text
        # Remove emojis
        # This pattern matches most emojis in the Unicode range
        # Note: We keep punctuation and alphanumeric (including accented)
        s = re.sub(r'[\U00010000-\U0010ffff]', '', s)
        
        # Remove markdown
        s = re.sub(r"```[\s\S]*?```", "", s)
        s = re.sub(r"`([^`]+)`", r"\1", s)
        s = re.sub(r"^#{1,6}\s+", "", s, flags=re.MULTILINE)
        s = re.sub(r"\*\*\*(.+?)\*\*\*", r"\1", s)
        s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
        s = re.sub(r"__(.+?)__", r"\1", s)
        s = re.sub(r"\*(.+?)\*", r"\1", s)
        s = re.sub(r"_(.+?)_", r"\1", s)
        s = re.sub(r"~~(.+?)~~", r"\1", s)
        s = re.sub(r"!?\[([^\]]*)\]\([^)]+\)", r"\1", s)
        s = re.sub(r"^\s*[-*+]\s+", "", s, flags=re.MULTILINE)
        s = re.sub(r"^\s*\d+\.\s+", "", s, flags=re.MULTILINE)
        s = re.sub(r"^>+\s?", "", s, flags=re.MULTILINE)
        s = re.sub(r"---+|\*\*\*+|___+", "", s)
        s = re.sub(r"\|", " ", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()

    def speak(self, text: str):
        """Enqueues a phrase to be spoken."""
        cleaned = self._strip_markdown(text.strip())
        if not self.enabled or not cleaned or len(cleaned) < 3:
            return

        # Always add to queue first - worker will process when ready
        self.text_queue.put(cleaned)

        # Then try to start worker (waits up to 3s for init)
        self.start()

    def wait_for_completion(self):
        """Waits for all items in the speech queue to be processed."""
        self.text_queue.join()

    def shutdown(self):
        """Graceful shutdown of the system."""
        self.stop_event.set()
        self.text_queue.put(None)
        if self.worker_thread:
            self.worker_thread.join(timeout=2)
            self.worker_thread = None
        logger.info("[TTS] System shut down.")


tts = TTSManager()


def start_workers():
    tts.start()


def stop_all():
    tts.stop()


def speak_sentence(text: str):
    tts.speak(text)


def is_speaking():
    """Checks if TTS is currently active."""
    return tts.is_busy()


async def speak_stream(text_stream):
    """Placeholder for stream support if needed."""
    if isinstance(text_stream, str):
        tts.speak(text_stream)
    else:
        async for chunk in text_stream:
            if chunk:
                tts.speak(chunk)


def wait_speech_complete():
    tts.wait_for_completion()


def shutdown():
    tts.shutdown()
