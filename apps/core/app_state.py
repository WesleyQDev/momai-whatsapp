import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

active_websockets: list[WebSocket] = []
main_loop: asyncio.AbstractEventLoop | None = None
reminder_manager = None
ww = None
system_ready = asyncio.Event()

is_gaming_mode = False
ai_stack_loaded = False
ai_busy = False
startup_error: str | None = None
last_interaction_time = time.time()

last_init_event: dict[str, Any] = {
    "stage": "pending",
    "message": "Aguardando inicializacao...",
    "progress": 0,
}

orchestrator = None
generate = None
initialize_llm = None
WakeWordDetector = None
ReminderManager = None
tts = None
extension_manager = None

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


_ai_stack_lock = asyncio.Lock()

async def initialize_ai_stack() -> None:
    """Lazy load heavy AI modules."""
    global \
        orchestrator, \
        generate, \
        initialize_llm, \
        WakeWordDetector, \
        ReminderManager, \
        tts, \
        extension_manager, \
        ai_stack_loaded

    if ai_stack_loaded:
        return

    async with _ai_stack_lock:
        if ai_stack_loaded:
            return
            
        logger.info("[Main] Loading AI stack...")
        # Give a small gap for heartbeats/sockets
        await asyncio.sleep(0.1)

    try:
        import ai.orchestrator as orch
    except Exception as e:
        logger.exception("[Main] Failed to import ai.orchestrator: %s", e)
        startup_error_msg = f"AI module import failed: {e}"
        globals()["startup_error"] = startup_error_msg
        await send_init_event("error", startup_error_msg, 0)
        raise

    orchestrator = orch
    from ai.orchestrator import generate as gen_func, initialize_llm as init_llm

    generate = gen_func
    initialize_llm = init_llm

    try:
        from services.voice.detector import WakeWordDetector as WWD
    except Exception as e:
        logger.warning("[Main] WakeWordDetector import skipped: %s", e)
        WWD = None

    WakeWordDetector = WWD
    from services.reminders.manager import ReminderManager as RM

    ReminderManager = RM

    try:
        import services.voice.tts as t
    except Exception as e:
        logger.warning("[Main] TTS import skipped: %s", e)
        t = None

    tts = t

    if t:
        # Connect TTS callbacks to socket broadcast
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

        t.tts.on_speech_start = on_tts_start
        t.tts.on_speech_stop = on_tts_stop

    from services.extensions.manager import extension_manager as em

    extension_manager = em

    ai_stack_loaded = True
    logger.info("[Main] AI stack loaded.")


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
    """Processes a recognized voice command through the AI engine."""
    # If the text is empty, the user just said the keyword.
    # We provide a prompt to show we are listening.
    if not text or len(text.strip()) < 2:
        text = "Oi"  # This will trigger a greeting/ready response from the AI

    logger.info("[Voice] Processing: %s", text)
    logger.debug("[Voice] Thread: %s, Active sockets: %d", last_thread_id, len(active_websockets))

    await broadcast_to_sockets({"type": "user", "content": text})

    from api.schemas import ChatMessage

    msg = ChatMessage(content=text, thread_id=last_thread_id)
    try:
        logger.debug("[Voice] Calling generate...")
        await broadcast_to_sockets({"type": "assistant", "data": {"status": "Pensando..."}})
        
        async for chunk in generate(msg, speak_response=speak_response):
            if chunk.startswith("data: "):
                json_str = chunk.replace("data: ", "").strip()
                if not json_str:
                    continue
                try:
                    data = json.loads(json_str)
                    await broadcast_to_sockets({"type": "assistant", "data": data})
                except json.JSONDecodeError as e:
                    logger.debug("[Voice] Failed to decode stream chunk: %s", e)
        logger.debug("[Voice] Generate completed")
    except Exception as exc:
        logger.exception("Error processing voice: %s", exc)
        await broadcast_to_sockets({"type": "assistant", "data": {"error": str(exc)}})


async def broadcast_resource_usage() -> None:
    """Background task to broadcast system resource usage."""
    while True:
        if active_websockets:
            try:
                import tools.system_actions as sys_tools

                stats = sys_tools.get_momai_resources()
                await broadcast_to_sockets({"type": "resource_usage", "data": stats})
            except Exception as exc:
                logger.debug("Error getting resource usage: %s", exc)
        await asyncio.sleep(5)


def notify_economy_change(status: str) -> None:
    """Callback para o ResourceManager notificar a UI via WebSocket."""
    if main_loop:
        main_loop.call_soon_threadsafe(
            lambda: asyncio.create_task(
                broadcast_to_sockets(
                    {
                        "type": "fortscript_event",
                        "status": status,
                        "timestamp": datetime.now().isoformat(),
                    }
                )
            )
        )
