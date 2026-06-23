import asyncio
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import WebSocket

if "MOMAI_DATA_DIR" in os.environ and "HF_HOME" not in os.environ:
    _hf_home = Path(os.environ["MOMAI_DATA_DIR"]) / "cache" / "huggingface"
    _hf_home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(_hf_home)

logger = logging.getLogger("momai.app_state")

_http_client: httpx.AsyncClient | None = None

active_websockets: list[WebSocket] = []
_ws_lock = threading.Lock()
_whisper_model_cache: dict[str, Any] = {}
_whisper_lock = threading.Lock()
main_loop: asyncio.AbstractEventLoop | None = None
ww = None
system_ready = asyncio.Event()

last_init_event: dict[str, Any] = {
    "stage": "pending",
    "message": "Aguardando inicializacao...",
    "progress": 0,
}

tts = None

call_mode = False
last_thread_id = "default"


from database.models import Settings

_settings_cache: Settings | None = None
_settings_cache_time: float = 0
_settings_cache_ttl: float = 10.0
_settings_lock = asyncio.Lock()


def _load_settings_from_json() -> Settings | None:
    """Read settings from node-core-store.json (single source of truth).

    Returns a Settings object built from the JSON store, or None if the
    store file is missing, malformed, or has no `settings` block. Unknown
    keys in the JSON are ignored so the JSON may carry forward-compat
    fields without breaking the read path.
    """
    data_dir = Path(os.environ.get("MOMAI_DATA_DIR", "."))
    store_path = data_dir / "data" / "node-core-store.json"
    if not store_path.exists():
        return None
    try:
        store = json.loads(store_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read node-core-store.json: %s", exc)
        return None
    settings_data = store.get("settings")
    if not settings_data:
        return None
    s = Settings()
    for key, value in settings_data.items():
        if hasattr(s, key):
            setattr(s, key, value)
    return s


async def get_settings_cached() -> Settings | None:
    """Fetch settings from node-core-store.json with TTL caching.

    This is the chokepoint for all settings reads (chat_voice, voice,
    i18n, startup). After the U001 cutover, it reads from
    node-core-store.json (the file the Node-core sidecar writes) instead
    of the legacy SQLite Settings table. The legacy SQLAlchemy Settings
    model is kept for read-only backwards compatibility but is no longer
    the source of truth.
    """
    global _settings_cache, _settings_cache_time
    now = time.monotonic()
    if _settings_cache is not None and (now - _settings_cache_time) < _settings_cache_ttl:
        return _settings_cache
    async with _settings_lock:
        if _settings_cache is not None and (now - _settings_cache_time) < _settings_cache_ttl:
            return _settings_cache
        settings = await asyncio.to_thread(_load_settings_from_json)
        _settings_cache = settings
        _settings_cache_time = now
        return settings


async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=15.0, pool=5.0),
            limits=limits
        )
    return _http_client


def is_call_mode() -> bool:
    """Returns whether call mode is active."""
    return call_mode


def set_call_mode(enabled: bool) -> None:
    """Enable or disable call mode."""
    global call_mode
    call_mode = enabled
    logger.debug("[Main] Call mode: %s", enabled)


external_tts_speaking = False

def set_external_tts_speaking(speaking: bool) -> None:
    """Set the state of external TTS engines (like EdgeTTS via Node)"""
    global external_tts_speaking
    external_tts_speaking = speaking
    logger.debug("[Main] External TTS speaking: %s", speaking)
    if ww:
        try:
            ww.flush_buffers()
        except Exception:
            logger.debug("[Main] Failed to flush WW buffers on TTS state change", exc_info=True)
    if not speaking and ww:
        try:
            import time
            ww._tts_stop_time = time.time()
        except Exception:
            logger.debug("[Main] Failed to set TTS stop time", exc_info=True)

def _bind_tts_callbacks(tts_module) -> None:
    """Attach TTS lifecycle callbacks to websocket events."""
    if not tts_module:
        return

    def on_tts_start():
        if main_loop:
            asyncio.run_coroutine_threadsafe(
                broadcast_to_sockets({"type": "tts_start"}), main_loop
            )

    def on_tts_stop():
        if main_loop:
            asyncio.run_coroutine_threadsafe(
                broadcast_to_sockets({"type": "tts_stop"}), main_loop
            )

    tts_module.tts.on_speech_start = on_tts_start
    tts_module.tts.on_speech_stop = on_tts_stop


def ensure_tts_runtime(prewarm: bool = False):
    """Ensure TTS module is imported and callbacks are wired."""
    global tts

    if tts is None:
        try:
            import services.voice.tts as t
        except Exception as e:
            logger.warning("[Main] TTS import skipped: %s", e)
            return None
        tts = t
        _bind_tts_callbacks(tts)
        logger.debug("[Main] TTS runtime loaded")

    if prewarm:
        try:
            tts.tts.initialize()
            logger.debug("[Main] TTS prewarm requested")
        except Exception as e:
            logger.warning("[Main] TTS prewarm failed: %s", e)

    return tts


def get_wake_word_detector_class():
    """Returns WakeWordDetector class without loading legacy AI stack."""
    try:
        from services.voice.detector import WakeWordDetector as detector_cls
        return detector_cls
    except Exception as e:
        logger.warning("[Main] WakeWordDetector import skipped: %s", e)
        return None


async def broadcast_to_sockets(message: dict) -> None:
    """Broadcasts a JSON message to all connected WebSockets concurrently."""
    sockets = snapshot_websockets()
    if not sockets:
        return

    async def _safe_send(ws):
        try:
            await asyncio.wait_for(ws.send_json(message), timeout=2.0)
        except Exception:
            remove_websocket(ws)

    tasks = [asyncio.create_task(_safe_send(ws)) for ws in sockets]
    await asyncio.gather(*tasks, return_exceptions=True)


def add_websocket(ws: WebSocket) -> None:
    """Thread-safe append of a WebSocket to the active list."""
    with _ws_lock:
        active_websockets.append(ws)


def remove_websocket(ws: WebSocket) -> None:
    """Thread-safe removal of a WebSocket from the active list."""
    with _ws_lock:
        try:
            active_websockets.remove(ws)
        except ValueError:
            pass


def snapshot_websockets() -> list[WebSocket]:
    """Return a thread-safe snapshot of the active WebSocket list."""
    with _ws_lock:
        return list(active_websockets)


def _load_whisper(size: str) -> Any:
    """Load a Faster-Whisper model of the given size. Internal helper."""
    import ctranslate2
    from faster_whisper import WhisperModel

    device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    logger.info(
        "[Whisper] Loading model '%s' on %s (compute_type=%s)",
        size, device, compute_type,
    )
    return WhisperModel(size, device=device, compute_type=compute_type)


def get_whisper_model_singleton(size: str = "tiny") -> Any:
    """
    Return a process-wide shared Faster-Whisper model for the given size.

    Caches one instance per size so the 3 load paths (wake-word detector,
    quick transcriber, WhatsApp reply) don't each spin up a separate copy.
    """
    if size in _whisper_model_cache:
        return _whisper_model_cache[size]
    with _whisper_lock:
        if size in _whisper_model_cache:
            return _whisper_model_cache[size]
        _whisper_model_cache[size] = _load_whisper(size)
        return _whisper_model_cache[size]


async def send_init_event(stage: str, message: str, progress: int | None = None) -> None:
    """Envia eventos de progresso de inicializacao para o frontend.
    Se progress for None, o progresso sera incrementado sutilmente.
    """
    global last_init_event

    current_progress = last_init_event.get("progress", 0)

    if progress is None:
        if current_progress >= 100:
            return
        new_progress = min(99, current_progress + 1)
    elif progress == 0 and stage == "error":
        new_progress = 0
    elif progress < current_progress and progress != 0 and progress != 100:
        # Previne que atividades paralelas causem o progresso reverter
        new_progress = current_progress
    else:
        new_progress = progress

    last_init_event = {"stage": stage, "message": message, "progress": new_progress}

    await broadcast_to_sockets({"type": "init_progress", "data": last_init_event})
    logger.debug("[Init %s%%] %s: %s", new_progress, stage, message)


async def process_voice_command(text: str, speak_response: bool = True) -> None:
    """Processes wake-word voice command through Node core voice-command route."""
    # If the text is empty, the user just said the keyword.
    # We provide a prompt to show we are listening.
    if not text or len(text.strip()) < 2:
        text = "Oi"  # This will trigger a greeting/ready response from the AI

    logger.debug("[Voice] Processing: %s", text)
    logger.debug("[Voice] Thread: %s", last_thread_id)

    node_host = os.getenv("MOMAI_NODE_CORE_HOST", "127.0.0.1")
    node_port = int(os.getenv("MOMAI_NODE_CORE_PORT", "8000"))
    node_url = f"http://{node_host}:{node_port}/chat/voice-command"
    try:
        logger.debug("[Voice] Calling node voice-command: %s", node_url)

        payload = {
            "content": text,
            "thread_id": last_thread_id,
            "speak_response": bool(speak_response),
        }

        client = await get_http_client()
        response = await client.post(node_url, json=payload)
        if response.status_code >= 400:
            detail = response.text
            raise RuntimeError(
                f"Node voice-command failed: HTTP {response.status_code} {detail[:240]!r}"
            )
        logger.debug("[Voice] Node voice-command completed")
    except Exception as exc:
        logger.error("Error processing voice: %s", exc)
        try:
            await broadcast_to_sockets({
                "type": "voice_error",
                "message": "Erro ao processar comando de voz."
            })
        except Exception:
            pass


async def close_http_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None
