import asyncio

from fastapi import APIRouter

import app_state
from api.deps import require_ai_loaded
from api.schemas import ModeChange, CallModeUpdate

router = APIRouter()


@router.post("/mode")
@require_ai_loaded
async def set_mode(mode_data: ModeChange):
    # Ignore requested mode, force local
    import threading

    threading.Thread(target=app_state.initialize_llm).start()
    await app_state.broadcast_to_sockets(
        {"type": "model_changed", "data": {"new_mode": "local"}}
    )
    return {"status": "ok", "mode": "local"}


@router.post("/mode/call-mode")
async def set_call_mode(data: CallModeUpdate):
    """Enable or disable call mode (voice without wake word)."""
    enabled = data.enabled
    app_state.set_call_mode(enabled)

    # Flush audio buffers to discard any speech captured before activation/deactivation
    if app_state.ww:
        app_state.ww.flush_buffers()
        # Ensure the detector is running when entering call mode
        if enabled and not app_state.ww.running:
            app_state.ww.start()

    await app_state.broadcast_to_sockets(
        {"type": "call_mode_changed", "data": {"enabled": enabled}}
    )
    return {"status": "ok", "call_mode": enabled}


@router.get("/mode/call-mode/status")
async def get_call_mode_status():
    """Returns current call mode state."""
    return {"call_mode": app_state.is_call_mode()}
