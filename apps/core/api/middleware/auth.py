import os
from typing import Optional

from fastapi import Header, HTTPException


def verify_token(authorization: Optional[str] = Header(None)) -> None:
    """FastAPI dependency that validates the session token.

    The expected token comes from the MOMAI_SESSION_TOKEN env var,
    which is set by the Electron main process on app start and
    inherited by the Python backend.
    """
    expected = os.getenv("MOMAI_SESSION_TOKEN", "")
    if not expected:
        raise HTTPException(
            status_code=500, detail="server misconfigured: no session token"
        )
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


def verify_ws_token(websocket) -> bool:
    """Validate ?token=<token> query param against MOMAI_SESSION_TOKEN.

    Browsers cannot set custom headers on WebSocket, so the renderer
    passes the token in the URL. The endpoint should call this BEFORE
    websocket.accept() to reject unauthorized upgrades.
    """
    expected = os.environ.get("MOMAI_SESSION_TOKEN")
    if not expected:
        return False
    provided = websocket.query_params.get("token")
    if not provided:
        return False
    return provided == expected
