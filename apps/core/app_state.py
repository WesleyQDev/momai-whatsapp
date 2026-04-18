import asyncio
import logging
import os
import time
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

active_websockets: list[WebSocket] = []
main_loop: asyncio.AbstractEventLoop | None = None
reminder_manager = None
ww = None
system_ready = asyncio.Event()

is_gaming_mode = False
ai_busy = False
startup_error: str | None = None
last_interaction_time = time.time()

last_init_event: dict[str, Any] = {
    "stage": "pending",
    "message": "Aguardando inicializacao...",
    "progress": 0,
}

tts = None

active_graph = {"view": None, "bypass_wake_word": False}

pending_graph_data: dict[str, dict[str, Any]] = {}

call_mode = False
last_thread_id = "default"


def is_call_mode() -> bool:
    """Returns whether call mode is active."""
    return call_mode


def set_call_mode(enabled: bool) -> None:
    """Enable or disable call mode."""
    global call_mode
    call_mode = enabled
    logger.info("[Main] Call mode: %s", enabled)


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
        logger.info("[Main] TTS runtime loaded")

    if prewarm:
        try:
            tts.tts.initialize()
            logger.info("[Main] TTS prewarm requested")
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


def set_gaming_mode(enabled: bool) -> None:
    """Set gaming mode flag."""
    global is_gaming_mode
    is_gaming_mode = enabled
    logger.info("[Main] Gaming mode: %s", enabled)


def set_ai_busy(enabled: bool) -> None:
    """Marks when the AI pipeline is actively streaming a response."""
    global ai_busy, last_interaction_time
    ai_busy = enabled
    if enabled:
        last_interaction_time = time.time()


def is_ai_busy() -> bool:
    """Returns True when AI is generating or speaking a response."""
    return ai_busy


def set_pending_graph_data(thread_id: str, data: dict) -> None:
    """Stores graph data to be saved with the next message."""
    pending_graph_data[thread_id] = data


def get_pending_graph_data(thread_id: str) -> dict | None:
    """Retrieves and clears pending graph data for a thread."""
    return pending_graph_data.pop(thread_id, None)


def get_graph_state() -> dict[str, Any]:
    """Returns current active UI graph state."""
    return active_graph


def set_graph_state(view: str | None, bypass_wake_word: bool = False) -> None:
    """Updates the active UI graph state."""
    global active_graph
    active_graph = {"view": view, "bypass_wake_word": bypass_wake_word}
    logger.debug("[Main] Graph State changed: %s", active_graph)


async def broadcast_to_sockets(message: dict) -> None:
    """Broadcasts a JSON message to all connected WebSockets."""
    # iterate over a copy of the list to avoid collection-has-changed errors
    for ws in list(active_websockets):
        try:
            await ws.send_json(message)
        except Exception as exc:
            logger.warning("[WebSocket] Broadcast error: %s", exc)
            if ws in active_websockets:
                try:
                    active_websockets.remove(ws)
                except ValueError:
                    pass


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

    logger.info("[Voice] Processing: %s", text)
    logger.debug("[Voice] Thread: %s", last_thread_id)

    node_host = os.getenv("MOMAI_NODE_CORE_HOST", "127.0.0.1")
    node_port = int(os.getenv("MOMAI_NODE_CORE_PORT", "8000"))
    node_url = f"http://{node_host}:{node_port}/chat/voice-command"
    try:
        import httpx

        logger.debug("[Voice] Calling node voice-command: %s", node_url)

        payload = {
            "content": text,
            "thread_id": last_thread_id,
            "speak_response": bool(speak_response),
        }

        timeout = httpx.Timeout(connect=5.0, read=30.0, write=15.0, pool=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(node_url, json=payload)
            if response.status_code >= 400:
                detail = response.text
                raise RuntimeError(
                    f"Node voice-command failed: HTTP {response.status_code} {detail[:240]!r}"
                )
        logger.debug("[Voice] Node voice-command completed")
    except Exception as exc:
        logger.exception("Error processing voice: %s", exc)


