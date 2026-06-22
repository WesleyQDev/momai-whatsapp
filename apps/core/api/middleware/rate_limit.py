from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


def build_limiter(default_limit: str = "60/minute") -> Limiter:
    return Limiter(key_func=get_remote_address, default_limits=[default_limit])


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"ok": False, "error": "rate limit exceeded", "detail": str(exc)},
    )
