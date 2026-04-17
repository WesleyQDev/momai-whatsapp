from fastapi import APIRouter
from api.routes import chat, voice, status, plugins, ws, reminders, settings, setup

api_router = APIRouter()


def include_routes():
    # Chat and Voice kept for streaming/audio heavy tasks (optional, can be moved to node later)
    api_router.include_router(chat.router)
    api_router.include_router(voice.router)
    api_router.include_router(status.router)
    # The new plugin runner endpoint
    api_router.include_router(plugins.router)
    # Essential routes for GUI and core functionality
    api_router.include_router(ws.router)
    api_router.include_router(reminders.router)
    api_router.include_router(settings.router)
    api_router.include_router(setup.router)


include_routes()
