import asyncio
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


async def ensure_wake_word_detector():
    """Lazy-initialize wake word detector and callbacks on first use."""
    import app_state

    if app_state.ww:
        return app_state.ww

    detector_cls = app_state.get_wake_word_detector_class()
    if not detector_cls:
        raise RuntimeError("Wake word detector unavailable")

    def _on_status(status: str):
        if app_state.main_loop:
            asyncio.run_coroutine_threadsafe(
                app_state.broadcast_to_sockets({"type": "voice_status", "status": status}),
                app_state.main_loop,
            )

    def _on_partial(text: str):
        if app_state.main_loop:
            asyncio.run_coroutine_threadsafe(
                app_state.broadcast_to_sockets({"type": "voice_partial", "text": text}),
                app_state.main_loop,
            )

    def _on_command(text: str):
        if app_state.main_loop:
            asyncio.run_coroutine_threadsafe(
                app_state.process_voice_command(text, speak_response=True),
                app_state.main_loop,
            )

    app_state.ww = detector_cls(
        keyword="luna",
        variants=["luna", "computador"],
        callback=_on_command,
        status_callback=_on_status,
        partial_callback=_on_partial,
        bypass_condition=app_state.is_call_mode,
    )
    return app_state.ww


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
def quick_transcribe():
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


@router.post("/stop-quick-transcribe")
def stop_quick_transcribe():
    """
    Interrompe manualmente a gravação do quick_transcribe.
    """
    try:
        transcriber = get_transcriber()
        transcriber.stop_recording()
        return {"success": True}
    except Exception as e:
        logger.error(f"[VoiceAPI] Stop quick transcribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class WakeWordControl(BaseModel):
    enabled: bool


class CallModeControl(BaseModel):
    enabled: bool


@router.post("/wake-word")
async def control_wake_word(control: WakeWordControl):
    """
    Enables or disables the wake word detector.
    Used by Electron to pause wake word when window is minimized.
    """
    try:
        import app_state

        # Prevent enabling if Lite tier
        from database.models import SessionLocal, Settings
        db = SessionLocal()
        settings = db.query(Settings).first()
        db.close()
        
        if not control.enabled or (settings and settings.ai_tier != "ultra"):
            if app_state.ww:
                logger.info("[VoiceAPI] Stopping and clearing wake word detector due to disable/tier change.")
                app_state.ww.stop()
                app_state.ww = None
            
            if not control.enabled:
                return {"success": True, "message": "Wake word disabled"}
            else:
                return {"success": False, "message": "Wake word only available in Ultra tier"}

        if not app_state.ww:
            await ensure_wake_word_detector()

        if app_state.ww:
            app_state.ww.wake_word_active = True
            if not app_state.ww.running:
                app_state.ww.start()
            logger.info("[VoiceAPI] Wake word enabled")
            return {"success": True, "message": "Wake word enabled"}
        
        return {"success": False, "message": "Failed to initialize detector"}


    except Exception as e:
        logger.error(f"[VoiceAPI] Wake word control error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/call-mode")
async def control_call_mode(control: CallModeControl):
    """
    Sync call-mode state from Node core to Python sidecar.
    In call-mode we keep detector running and bypass wake-word keyword matching.
    """
    try:
        import app_state

        app_state.set_call_mode(control.enabled)

        if control.enabled and not app_state.ww:
            await ensure_wake_word_detector()

        if app_state.ww:
            if control.enabled:
                app_state.ww.wake_word_active = True
                try:
                    app_state.ww.flush_buffers()
                except Exception:
                    pass
                if not app_state.ww.running:
                    app_state.ww.start()
            else:
                # Keep running only if explicit wake-word setting is enabled.
                from database.models import SessionLocal, Settings

                db = SessionLocal()
                try:
                    settings = db.query(Settings).first()
                finally:
                    db.close()

                keep_wake_word = bool(settings and settings.wake_word_enabled and settings.ai_tier == "ultra")
                if not keep_wake_word:
                    app_state.ww.wake_word_active = False
                    app_state.ww.stop()
                    app_state.ww = None

        return {"success": True, "call_mode": app_state.is_call_mode()}
    except Exception as e:
        logger.error(f"[VoiceAPI] Call mode control error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
