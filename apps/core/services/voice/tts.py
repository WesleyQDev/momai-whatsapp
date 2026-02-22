import warnings

try:
    import sounddevice as sd

    HAS_SOUNDDEVICE = True
except OSError:
    HAS_SOUNDDEVICE = False

import numpy as np
import threading
import time
import logging
import queue
import asyncio
import io
import os
from typing import Optional, Any

os.environ["TOKENIZERS_PARALLELISM"] = "false"

warnings.filterwarnings("ignore", category=UserWarning)

logger = logging.getLogger("momai.tts")

ONNX_PROVIDER = "CPUExecutionProvider"
try:
    import onnxruntime

    if "CUDAExecutionProvider" in onnxruntime.get_available_providers():
        ONNX_PROVIDER = "CUDAExecutionProvider"
        logger.info("[TTS] Using GPU acceleration for TTS")
except Exception:
    pass

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
DEFAULT_LANG = "pt-br"


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

        threading.Thread(target=self._initialize_kokoro, daemon=True).start()

    def _initialize_kokoro(self):
        """Initializes the TTS pipeline using kokoro-onnx."""
        try:
            logger.info("[TTS] Loading Kokoro-ONNX...")

            from kokoro_onnx import Kokoro
            import onnxruntime as ort

            model_dir = os.path.join(os.path.dirname(__file__), "models")
            os.makedirs(model_dir, exist_ok=True)

            model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
            voices_path = os.path.join(model_dir, "voices-v1.0.bin")

            if not os.path.exists(model_path):
                logger.info("[TTS] Downloading Kokoro model...")
                try:
                    from huggingface_hub import hf_hub_download

                    model_path = hf_hub_download(
                        repo_id="thewh1teagle/kokoro-onnx",
                        filename="kokoro-v1.0.onnx",
                        local_dir=model_dir,
                    )
                except Exception as e:
                    logger.warning(
                        f"[TTS] HF download failed: {e}, trying direct download..."
                    )
                    import urllib.request

                    url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
                    urllib.request.urlretrieve(url, model_path)

            if not os.path.exists(voices_path):
                logger.info("[TTS] Downloading voices file...")
                try:
                    from huggingface_hub import hf_hub_download

                    voices_path = hf_hub_download(
                        repo_id="thewh1teagle/kokoro-onnx",
                        filename="voices-v1.0.bin",
                        local_dir=model_dir,
                    )
                except Exception as e:
                    logger.warning(
                        f"[TTS] HF download failed: {e}, trying direct download..."
                    )
                    import urllib.request

                    url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
                    urllib.request.urlretrieve(url, voices_path)

            providers = [ONNX_PROVIDER]
            if ONNX_PROVIDER == "CPUExecutionProvider":
                providers.append("CPUExecutionProvider")

            self.kokoro = Kokoro(model_path, voices_path)

            self.has_tts = True
            self.ready_event.set()
            logger.info("✅ [TTS] Kokoro-ONNX ready!")
        except Exception as e:
            self._error = str(e)
            self.has_tts = False
            self.ready_event.set()
            logger.error(f"❌ [TTS] Error loading Kokoro-ONNX: {e}")

    def _speech_worker(self):
        """Processes the speech queue, generating and playing audio using Kokoro-ONNX."""
        stream = None
        self.ready_event.wait()

        if self._error or not self.has_tts:
            logger.warning(f"[TTS] Worker stopping: system unavailable ({self._error})")
            return

        try:
            if HAS_SOUNDDEVICE:
                try:
                    self.active_stream = sd.OutputStream(
                        samplerate=24000,
                        channels=1,
                        dtype="float32",
                    )
                    self.active_stream.start()
                    stream = self.active_stream
                except Exception as e:
                    logger.error(
                        f"[TTS] Failed to open sounddevice stream: {e}. Falling back to frontend playback."
                    )
                    stream = None
            else:
                logger.info(
                    "[TTS] Sounddevice not available. Using frontend playback fallback."
                )
                stream = None

            while not self.stop_event.is_set():
                try:
                    text = self.text_queue.get(timeout=0.5)
                    if text is None:
                        break

                    with self.state_lock:
                        current_session_id = self.session_id

                    logger.debug(
                        f"[TTS Work] Processing: {text[:30]}... (Session {current_session_id})"
                    )

                    self._is_playing = True
                    if self.on_speech_start:
                        self.on_speech_start()

                    lang = LANG_CODE_MAP.get(self.lang_code, "en-us")

                    audio_stream = self.kokoro.create_stream(
                        text, voice=self.voice, speed=1.0, lang=lang
                    )

                    audio_played = False

                    async def process_stream():
                        nonlocal audio_played
                        async for samples, sr in audio_stream:
                            if samples is None or len(samples) == 0:
                                continue

                            with self.state_lock:
                                if (
                                    self.session_id != current_session_id
                                    or self.stop_event.is_set()
                                ):
                                    break

                            audio_float32 = samples.astype(np.float32)
                            audio_played = True

                            if stream:
                                sub_chunk_size = 1200
                                offset = 0
                                while offset < len(audio_float32):
                                    with self.state_lock:
                                        if (
                                            self.session_id != current_session_id
                                            or self.stop_event.is_set()
                                        ):
                                            break
                                    end = min(offset + sub_chunk_size, len(audio_float32))
                                    try:
                                        stream.write(audio_float32[offset:end])
                                    except Exception as e:
                                        logger.error(f"[TTS Stream] Write error: {e}")
                                        break
                                    offset = end
                            else:
                                import base64

                                audio_b64 = base64.b64encode(
                                    audio_float32.tobytes()
                                ).decode("utf-8")
                                print(f"[AUDIO_CHUNK] {audio_b64}", flush=True)

                    # Run the async generator in the worker's thread using a temporary loop or existing loop
                    try:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        loop.run_until_complete(process_stream())
                        loop.close()
                    except Exception as e:
                        logger.error(f"[TTS Async Run] {e}")

                    if not audio_played:
                        logger.warning("[TTS] No audio generated")

                    self._is_playing = False
                    if self.on_speech_stop:
                        self.on_speech_stop()
                    self.text_queue.task_done()
                except queue.Empty:
                    continue
                except Exception as e:
                    if not self.stop_event.is_set():
                        logger.error(f"[TTS Work Error] {e}")
                    try:
                        self.text_queue.task_done()
                    except ValueError:
                        pass
        finally:
            if stream:
                try:
                    stream.stop()
                    stream.close()
                except:
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
                if not self.ready_event.wait(timeout=10):
                    logger.error("[TTS] Initialization timeout")
                    return

            if self.worker_thread is not None and self.worker_thread.is_alive():
                return

            if self.worker_thread is not None:
                logger.debug(
                    f"[TTS] Cleaning up dead thread: {self.worker_thread.name}"
                )
                self.worker_thread = None

            logger.info("[TTS] Starting new worker thread...")
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

        with self.start_lock:
            self.stop_event.set()

            if self.active_stream:
                try:
                    self.active_stream.abort_stream()
                except:
                    pass

            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=2)

            self.worker_thread = None

        try:
            while not self.text_queue.empty():
                self.text_queue.get_nowait()
                self.text_queue.task_done()
        except Exception:
            pass

        logger.info("[TTS] Playback stopped and queue cleared.")

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

    def speak(self, text: str):
        """Enqueues a phrase to be spoken."""
        if not self.enabled or not text.strip():
            return

        self.start()
        self.text_queue.put(text.strip())

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
