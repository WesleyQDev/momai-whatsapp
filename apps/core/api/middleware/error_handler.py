import re

SAFE_MESSAGES = {
    "Internal server error",
    "Service unavailable",
    "Bad request",
    "Not found",
    "Unauthorized",
    "Forbidden",
    "Conflict",
    "Unprocessable entity",
}

_STACK_RE = re.compile(r"at\s+\S+\.\w+:\d+|Traceback \(most recent call last\)|Error:\s")
_PATH_RE = re.compile(r"/(?:etc|home|users|var|tmp|root)/|[A-Z]:\\", re.IGNORECASE)


def is_safe_message(msg: str) -> bool:
    if not isinstance(msg, str) or not msg:
        return False
    if msg in SAFE_MESSAGES:
        return True
    if len(msg) > 100:
        return False
    if _STACK_RE.search(msg):
        return False
    if _PATH_RE.search(msg):
        return False
    return True


def sanitize_message(message: str, is_dev: bool = False, fallback: str = "Internal server error") -> str:
    if is_dev:
        return str(message)
    return fallback if is_safe_message(fallback) else "Internal server error"
