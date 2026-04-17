from fastapi import APIRouter
from api.routes import voice, plugins, chat_voice

api_router = APIRouter()


def include_routes():
    # Sidecar Python: expose voice + plugin execution + TTS bridge endpoints.
    api_router.include_router(voice.router)
    api_router.include_router(plugins.router)
    api_router.include_router(chat_voice.router)
