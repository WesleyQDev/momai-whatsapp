import asyncio
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import logging

from services.voice.whatsapp_reply import WhatsAppReplyDetector
from api.middleware.auth import verify_ws_token

logger = logging.getLogger("momai.api.voice")


router = APIRouter(prefix="/voice", tags=["voice"])
# Router separado para WebSocket — não herda verify_token do router principal,
# pois WebSocket não pode enviar header Authorization como HTTP.
# A autenticação é feita via verify_ws_token com query param dentro do handler.
ws_router = APIRouter(prefix="/voice", tags=["voice"])


@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    import app_state

    if not verify_ws_token(websocket):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    app_state.add_websocket(websocket)
    logger.debug("[VoiceWS] New connection accepted")
    try:
        while True:
            # Keep connection alive and wait for client to close
            await websocket.receive_text()
    except WebSocketDisconnect:
        app_state.remove_websocket(websocket)
        logger.debug("[VoiceWS] Connection closed")
    except Exception as e:
        logger.error("[VoiceWS] Error: %s", e)
        app_state.remove_websocket(websocket)


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

    import os
    node_host = os.getenv("MOMAI_NODE_CORE_HOST", "127.0.0.1")
    node_port = os.getenv("MOMAI_NODE_CORE_PORT", "8000")
    keyword_check_url = f"http://{node_host}:{node_port}/skills/keywords/check"

    app_state.ww = detector_cls(
        keyword="luna",
        variants=["luna", "computador"],
        callback=_on_command,
        status_callback=_on_status,
        partial_callback=_on_partial,
        bypass_condition=app_state.is_call_mode,
        keyword_check_url=keyword_check_url,
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
            logger.debug(
                "[VoiceAPI] Using existing Whisper model from wake word detector"
            )
        else:
            # Fallback: usa o singleton de Whisper tiny
            model = app_state.get_whisper_model_singleton("tiny")

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
        text = await asyncio.to_thread(transcriber.record_and_transcribe)

        if not text:
            return TranscriptionResponse(text="", success=False)

        return TranscriptionResponse(text=text, success=True)

    except Exception as e:
        logger.error("[VoiceAPI] Quick transcribe error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/stop-quick-transcribe")
async def stop_quick_transcribe():
    """
    Interrompe manualmente a gravação do quick_transcribe.
    """
    try:
        transcriber = get_transcriber()
        await asyncio.to_thread(transcriber.stop_recording)
        return {"success": True}
    except Exception as e:
        logger.error("[VoiceAPI] Stop quick transcribe error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


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
        from app_state import get_settings_cached

        # Ignora tentativas de religar durante uma sessao de reply do WhatsApp
        if control.enabled and _whatsapp_reply_active:
            logger.info("[VoiceAPI] Ignoring wake word enable: WhatsApp reply active")
            return {"success": False, "message": "WhatsApp reply active"}

        # Prevent enabling if Lite tier
        settings = await get_settings_cached()
        
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
        logger.error("[VoiceAPI] Wake word control error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


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
                from app_state import get_settings_cached
                settings = await get_settings_cached()

                keep_wake_word = bool(settings and settings.wake_word_enabled and settings.ai_tier == "ultra")
                if not keep_wake_word:
                    app_state.ww.wake_word_active = False
                    app_state.ww.stop()
                    app_state.ww = None

        return {"success": True, "call_mode": app_state.is_call_mode()}
    except Exception as e:
        logger.error("[VoiceAPI] Call mode control error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

class TTSStatusReq(BaseModel):
    is_speaking: bool

@router.post("/tts-status")
async def update_tts_status(req: TTSStatusReq):
    """
    Sync TTS status from external engines (e.g. EdgeTTS from Node)
    to prevent wake word false positives while AI is speaking.
    """
    try:
        import app_state
        app_state.set_external_tts_speaking(req.is_speaking)
        return {"success": True}
    except Exception as e:
        logger.error("[VoiceAPI] TTS status update error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


class WhatsAppReplyWaitRequest(BaseModel):
    contact_jid: str


_whatsapp_reply_lock = asyncio.Lock()
_whatsapp_reply_active = False


def _get_whisper_model():
    """Reuse or load a Whisper model instance for the WhatsApp reply detector."""
    import app_state

    if hasattr(app_state, "ww") and app_state.ww and app_state.ww.model:
        return app_state.ww.model

    global _transcriber
    if _transcriber is not None:
        return _transcriber.model

    return app_state.get_whisper_model_singleton("tiny")


@router.post("/whatsapp-reply/wait")
async def whatsapp_reply_wait(req: WhatsAppReplyWaitRequest):
    """
    Blocking endpoint: inicia a escuta por 'responda', captura a resposta,
    transcreve e retorna o texto. A requisicao bloqueia ate o resultado
    ficar pronto ou timeout (30s).

    Pausa o wake word detector (Luna) durante a escuta para evitar
    que o Luna intercepte o 'responda' e mande pro LLM.
    """
    global _whatsapp_reply_active

    async with _whatsapp_reply_lock:
        if _whatsapp_reply_active:
            raise HTTPException(status_code=409, detail="Ja existe uma escuta ativa")
        _whatsapp_reply_active = True

    import app_state

    # Pausa o Luna (wake word) para nao conflitar
    was_luna_active = False
    if app_state.ww:
        was_luna_active = app_state.ww.wake_word_active
        app_state.ww.stop()
        app_state.ww = None
        logger.info("[VoiceAPI] Luna paused for WhatsApp reply")

    model = _get_whisper_model()
    result_event = asyncio.Event()
    result = {"text": "", "status": "error"}

    def _on_status(status: str):
        nonlocal result
        result["status"] = status
        if status in ("complete", "error", "timeout", "idle"):
            if app_state.main_loop:
                app_state.main_loop.call_soon_threadsafe(result_event.set)

    def _on_result(text: str, contact_jid: str):
        nonlocal result
        result["text"] = text
        result["status"] = "complete"
        if app_state.main_loop:
            app_state.main_loop.call_soon_threadsafe(result_event.set)

    detector = WhatsAppReplyDetector(
        model=model,
        on_result=_on_result,
        on_status=_on_status,
    )

    detector.start(contact_jid=req.contact_jid)

    try:
        await asyncio.wait_for(result_event.wait(), timeout=50.0)
    except asyncio.TimeoutError:
        result = {"text": "", "status": "timeout"}
    finally:
        detector.stop()
        _whatsapp_reply_active = False

        # Religa o Luna se estava ativo antes
        if was_luna_active:
            try:
                await ensure_wake_word_detector()
                if app_state.ww:
                    app_state.ww.wake_word_active = True
                    if not app_state.ww.running:
                        app_state.ww.start()
                    logger.info("[VoiceAPI] Luna resumed after WhatsApp reply")
            except Exception as e:
                logger.error(f"[VoiceAPI] Failed to resume Luna: {e}")

    return result
