from fastapi import APIRouter, Depends
from api.middleware.auth import verify_token
from api.routes import voice, chat_voice, health, settings

api_router = APIRouter()


def include_routes():
    # Public health endpoint (no auth) for liveness checks.
    api_router.include_router(health.router)
    # Settings JSON bridge (U001) — single source of truth in node-core-store.json.
    api_router.include_router(
        settings.router, dependencies=[Depends(verify_token)]
    )
    # All other routes are auth-gated via the verify_token dependency.
    api_router.include_router(
        voice.router, dependencies=[Depends(verify_token)]
    )
    api_router.include_router(
        chat_voice.router, dependencies=[Depends(verify_token)]
    )
