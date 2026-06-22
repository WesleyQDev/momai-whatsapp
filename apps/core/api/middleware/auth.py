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
