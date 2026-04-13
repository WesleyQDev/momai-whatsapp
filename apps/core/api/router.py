from fastapi import APIRouter
from api.routes import chat, voice, status, plugins

api_router = APIRouter()


def include_routes():
    # Chat and Voice kept for streaming/audio heavy tasks (optional, can be moved to node later)
    api_router.include_router(chat.router)
    api_router.include_router(voice.router)
    api_router.include_router(status.router)
    # The new plugin runner endpoint
    api_router.include_router(plugins.router)


include_routes()
