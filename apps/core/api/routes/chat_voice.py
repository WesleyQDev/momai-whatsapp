from fastapi import APIRouter, HTTPException
import logging

import app_state
from app_state import get_settings_cached

router = APIRouter()
logger = logging.getLogger("momai.api.chat_voice")


@router.post("/chat/stop-voice")
async def stop_chat_voice():
    try:
        import services.voice.tts as tts

        tts.stop_all()
    except Exception:
        logger.debug("[ChatVoice] TTS stop failed: module not ready", exc_info=True)

    return {"status": "ok"}


@router.post("/chat/speak")
async def speak_text(data: dict):
    text = data.get("text")
    if not text:
        logger.debug("[ChatVoice] /chat/speak blocked: empty text")
        raise HTTPException(status_code=400, detail="No text provided")
    if len(text) > 10000:
        logger.debug("[ChatVoice] /chat/speak blocked: text too long (%d chars)", len(text))
        raise HTTPException(status_code=413, detail="Text too long")

    try:
        # Load only voice runtime here (avoid full AI stack load on first TTS).
        tts = app_state.ensure_tts_runtime(prewarm=True)
        if not tts:
            logger.debug("[ChatVoice] /chat/speak blocked: app_state.tts unavailable")
            raise HTTPException(status_code=503, detail="TTS unavailable")

        settings = await get_settings_cached()

        if settings and settings.tts_enabled is False:
            logger.debug("[ChatVoice] /chat/speak blocked: settings.tts_enabled=false")
            raise HTTPException(status_code=409, detail="TTS is disabled in settings")

        # Sidecar mode: initialize TTS lazily on first speak request.
        tts.tts.initialize()

        # Prioritize voice from payload, fallback to DB settings
        voice_to_use = data.get("voice") or (settings.tts_voice if settings else None)
        if voice_to_use:
            tts.tts.set_voice(voice_to_use)

        tts.speak_sentence(text)
        logger.debug("[ChatVoice] /chat/speak accepted")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ChatVoice] /chat/speak failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
