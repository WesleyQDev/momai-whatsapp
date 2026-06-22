from fastapi import APIRouter, Depends
from api.middleware.auth import verify_token
from api.routes import voice, chat_voice, health

api_router = APIRouter()


def include_routes():
    # Public health endpoint (no auth) for liveness checks.
    api_router.include_router(health.router)
    # All other routes are auth-gated via the verify_token dependency.
    api_router.include_router(
        voice.router, dependencies=[Depends(verify_token)]
    )
    api_router.include_router(
        chat_voice.router, dependencies=[Depends(verify_token)]
    )
