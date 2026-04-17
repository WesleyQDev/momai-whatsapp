from fastapi import APIRouter

router = APIRouter()


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
        return {"status": "error", "message": "No text provided"}

    try:
        import services.voice.tts as tts

        # Sidecar mode: initialize TTS lazily on first speak request.
        tts.tts.initialize()
        tts.speak_sentence(text)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
