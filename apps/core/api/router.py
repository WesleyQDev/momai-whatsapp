from fastapi import APIRouter
from api.routes import voice, chat_voice

api_router = APIRouter()


def include_routes():
    # Sidecar Python: expose only voice/STT/TTS bridge endpoints.
    api_router.include_router(voice.router)
    api_router.include_router(chat_voice.router)
