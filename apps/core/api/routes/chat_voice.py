from fastapi import APIRouter, HTTPException
import logging

import app_state
from database.models import SessionLocal, Settings

router = APIRouter()
logger = logging.getLogger("uvicorn.error")


@router.post("/chat/stop-voice")
async def stop_chat_voice():
    try:
        import services.voice.tts as tts

        tts.stop_all()
    except Exception:
        # TTS might not be loaded yet
        pass

    return {"status": "ok"}


@router.post("/chat/speak")
async def speak_text(data: dict):
    text = data.get("text")
    if not text:
        logger.info("[ChatVoice] /chat/speak blocked: empty text")
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        # Load only voice runtime here (avoid full AI stack load on first TTS).
        tts = app_state.ensure_tts_runtime(prewarm=True)
        if not tts:
            logger.warning("[ChatVoice] /chat/speak blocked: app_state.tts unavailable")
            raise HTTPException(status_code=503, detail="TTS unavailable")

        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
        finally:
            db.close()

        if settings and settings.tts_enabled is False:
            logger.info("[ChatVoice] /chat/speak blocked: settings.tts_enabled=false")
            raise HTTPException(status_code=409, detail="TTS is disabled in settings")

        # Sidecar mode: initialize TTS lazily on first speak request.
        tts.tts.initialize()
        if settings and settings.tts_voice:
            tts.tts.set_voice(settings.tts_voice)
        tts.speak_sentence(text)
        logger.info("[ChatVoice] /chat/speak accepted")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ChatVoice] /chat/speak failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
