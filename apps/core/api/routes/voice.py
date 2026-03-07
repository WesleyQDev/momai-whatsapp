from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/voice", tags=["voice"])


class TranscriptionResponse(BaseModel):
    text: str
    success: bool


# Singleton do transcriber (inicializado lazy)
_transcriber = None


def get_transcriber():
    """Obtém ou inicializa o transcriber rápido."""
    global _transcriber
    if _transcriber is None:
        import app_state
        from services.voice.quick_transcriber import QuickTranscriber

        # Usa o modelo do wake word detector se disponível
        if hasattr(app_state, "ww") and app_state.ww and app_state.ww.model:
            model = app_state.ww.model
            logger.info(
                "[VoiceAPI] Using existing Whisper model from wake word detector"
            )
        else:
            # Fallback: carrega modelo tiny para transcrição rápida
            import ctranslate2
            from faster_whisper import WhisperModel

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            logger.info(
                f"[VoiceAPI] Loading Whisper tiny for quick transcription on {device}"
            )
            model = WhisperModel("tiny", device=device, compute_type=compute_type)

        _transcriber = QuickTranscriber(model)

    return _transcriber


@router.post("/quick-transcribe", response_model=TranscriptionResponse)
async def quick_transcribe():
    """
    Grava áudio até detectar silêncio (~1s) e retorna a transcrição.
    Usado para input de voz rápido no chat.
    """
    try:
        transcriber = get_transcriber()
        text = transcriber.record_and_transcribe()

        if not text:
            return TranscriptionResponse(text="", success=False)

        return TranscriptionResponse(text=text, success=True)

    except Exception as e:
        logger.error(f"[VoiceAPI] Quick transcribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class WakeWordControl(BaseModel):
    enabled: bool


@router.post("/wake-word")
async def control_wake_word(control: WakeWordControl):
    """
    Enables or disables the wake word detector.
    Used by Electron to pause wake word when window is minimized.
    """
    try:
        import app_state

        if not app_state.ww:
            return {"success": False, "message": "Wake word detector not initialized"}

        # Prevent enabling if Lite tier
        from database.models import SessionLocal, Settings
        db = SessionLocal()
        settings = db.query(Settings).first()
        db.close()
        
        if control.enabled and settings and settings.ai_tier != "ultra":
            return {"success": False, "message": "Wake word only available in Ultra tier"}

        if control.enabled:
            app_state.ww.wake_word_active = True
            if not app_state.ww.running:
                app_state.ww.start()
            logger.info("[VoiceAPI] Wake word enabled")
            return {"success": True, "message": "Wake word enabled"}
        else:
            app_state.ww.wake_word_active = False
            logger.info("[VoiceAPI] Wake word disabled")
            return {"success": True, "message": "Wake word disabled"}

    except Exception as e:
        logger.error(f"[VoiceAPI] Wake word control error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
