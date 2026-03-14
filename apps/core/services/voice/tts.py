import warnings
import threading
import time
import logging
import queue
import asyncio
import io
import sys
import os
from typing import Optional, Any

# Heavy imports deferred for faster startup
sd = None
np = None
HAS_SOUNDDEVICE = None

os.environ["TOKENIZERS_PARALLELISM"] = "false"

warnings.filterwarnings("ignore", category=UserWarning)

logger = logging.getLogger("momai.tts")

ONNX_PROVIDER = "CPUExecutionProvider"


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
            logger.info("✅ [TTS] Kokoro-ONNX ready!")
        except Exception as e:
            self._error = str(e)
            self.has_tts = False
            self.ready_event.set()
            logger.error(f"❌ [TTS] Error loading Kokoro-ONNX: {e}")

    def _speech_worker(self):
        """Pipeline TTS worker: generates and plays audio concurrently.

        Architecture:
          - A persistent asyncio event loop runs two concurrent tasks.
          - Generator task: pulls text from the queue, runs Kokoro create_stream(),
            and pushes audio chunks into an asyncio.Queue (the "audio pipe").
          - Player task: pulls audio chunks from the pipe and writes them to
            sounddevice (via run_in_executor so it doesn't block generation).

        This means while phrase N is still playing, phrase N+1 is already being
        synthesized by the ONNX model, eliminating the silence gap between phrases.
        """
        stream = None
        self.ready_event.wait()

        if self._error or not self.has_tts:
            logger.warning(f"[TTS] Worker stopping: system unavailable ({self._error})")
            return

        # Create a single persistent event loop for the entire worker lifetime
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

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

            # Pipeline queue: generator → player.  maxsize provides backpressure
            # so the generator doesn't run too far ahead of playback.
            audio_pipe: asyncio.Queue = asyncio.Queue(maxsize=30)

            # ------------------------------------------------------------------
            # Generator coroutine
            # ------------------------------------------------------------------
            async def generator():
                """Pulls text from text_queue, synthesises audio via Kokoro,
                and pushes chunks into the audio_pipe."""
                while not self.stop_event.is_set():
                    # Read from the synchronous queue without blocking the loop
                    try:
                        text = await loop.run_in_executor(
                            None,
                            lambda: self.text_queue.get(timeout=0.3),
                        )
                    except queue.Empty:
                        continue

                    if text is None:
                        await audio_pipe.put(None)  # poison pill
                        break

                    with self.state_lock:
                        sid = self.session_id

                    logger.debug(
                        f"[TTS Gen] Processing: {text[:40]}... (Session {sid})"
                    )

                    # Signal: a new phrase is starting
                    await audio_pipe.put(("speech_start", None, sid))

                    lang = LANG_CODE_MAP.get(self.lang_code, "en-us")
                    has_audio = False

                    try:
                        audio_stream = self.kokoro.create_stream(
                            text, voice=self.voice, speed=1.0, lang=lang
                        )
                        async for samples, sr in audio_stream:
                            if samples is None or len(samples) == 0:
                                continue
                            with self.state_lock:
                                if self.session_id != sid or self.stop_event.is_set():
                                    break
                            has_audio = True
                            await audio_pipe.put(
                                ("audio", samples.astype(np.float32), sid)
                            )
                    except Exception as e:
                        logger.error(f"[TTS Gen Error] {e}")

                    if not has_audio:
                        logger.warning(f"[TTS] No audio generated for: '{text[:50]}'")

                    # Signal: phrase finished generating
                    await audio_pipe.put(("speech_end", None, sid))

                    try:
                        self.text_queue.task_done()
                    except ValueError:
                        pass

                # If stop_event was set, still send poison pill so player exits
                if self.stop_event.is_set():
                    try:
                        audio_pipe.put_nowait(None)
                    except asyncio.QueueFull:
                        pass

            # ------------------------------------------------------------------
            # Player coroutine
            # ------------------------------------------------------------------
            async def player():
                """Pulls audio chunks from the pipe and plays them."""
                while not self.stop_event.is_set():
                    try:
                        item = await asyncio.wait_for(audio_pipe.get(), timeout=0.5)
                    except asyncio.TimeoutError:
                        continue

                    if item is None:
                        break

                    msg_type, data, sid = item

                    # Check if this item belongs to the current session
                    with self.state_lock:
                        stale = self.session_id != sid or self.stop_event.is_set()

                    if stale:
                        if msg_type == "speech_end":
                            self._is_playing = False
                        continue

                    if msg_type == "speech_start":
                        self._is_playing = True
                        if self.on_speech_start:
                            self.on_speech_start()
                        continue

                    if msg_type == "speech_end":
                        self._is_playing = False
                        if self.on_speech_stop:
                            self.on_speech_stop()
                        continue

                    # msg_type == "audio"
                    if stream:
                        SUB_CHUNK = 480  # ~20 ms at 24 kHz (reduced for lower latency)
                        offset = 0
                        while offset < len(data):
                            with self.state_lock:
                                if self.session_id != sid or self.stop_event.is_set():
                                    break
                            end = min(offset + SUB_CHUNK, len(data))
                            try:
                                # run_in_executor keeps the loop free for generation
                                await loop.run_in_executor(
                                    None, stream.write, data[offset:end]
                                )
                            except Exception as e:
                                logger.error(f"[TTS Stream] Write error: {e}")
                                break
                            offset = end
                    else:
                        import base64

                        audio_b64 = base64.b64encode(data.tobytes()).decode("utf-8")
                        sys.stdout.write(f"[AUDIO_CHUNK] {audio_b64}\n")
                        sys.stdout.flush()

            # ------------------------------------------------------------------
            # Run both tasks concurrently
            # ------------------------------------------------------------------
            async def pipeline():
                gen_task = asyncio.ensure_future(generator())
                play_task = asyncio.ensure_future(player())
                await gen_task
                await play_task

            loop.run_until_complete(pipeline())

        except Exception as e:
            if not self.stop_event.is_set():
                logger.error(f"[TTS Worker] Pipeline error: {e}")
        finally:
            if stream:
                try:
                    stream.stop()
                    stream.close()
                except Exception:
                    pass
            self.active_stream = None
            try:
                loop.close()
            except Exception:
                pass
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
                # Reduce timeout to 0.1s to avoid freezing the LLM stream if TTS is slow
                if not self.ready_event.wait(timeout=3.0):
                    logger.debug(
                        "[TTS] Still initializing, will wait for first phrase."
                    )
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

        # Reset playing flag immediately so is_speaking() returns False
        self._is_playing = False

        with self.start_lock:
            self.stop_event.set()

            if self.active_stream:
                try:
                    self.active_stream.abort_stream()
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
        cleaned = text.strip()
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
