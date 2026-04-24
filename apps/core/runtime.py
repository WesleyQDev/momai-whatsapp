import logging
import os
import sys
import threading

# Force UTF-8 encoding for Windows console
if sys.platform == "win32":
    import ctypes
    try:
        # Set console code page to UTF-8 (65001)
        ctypes.windll.kernel32.SetConsoleCP(65001)
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    except Exception:
        pass
    # Set environment variable for UTF-8
    os.environ["PYTHONIOENCODING"] = "utf-8"
    # Reconfigure stdout/stderr to UTF-8
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

logger = logging.getLogger(__name__)


class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        noisy_endpoints = [
            "/status",
            "/init-status",
            "/extensions",
            "/reminders/active",
            "/settings",
            "/chat/history",
            "/chat/stream",
            "/chat/title",
            "/chat/completions",
        ]
        return not any(endpoint in msg for endpoint in noisy_endpoints)


class ColorFormatter(logging.Formatter):
    """Custom format to avoid dual timestamps and inject ANSI colors."""

    COLORS = {
        "DEBUG": "\033[90m",  # Gray
        "INFO": "\033[36m",  # Cyan
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[1;31m",  # Bold Red
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        # Get colored level (no timestamp — parent logger already adds it)
        color = self.COLORS.get(record.levelname, self.RESET)
        level_colored = f"{color}[{record.levelname}]{self.RESET}"
        
        # Format message
        msg = record.getMessage()
        
        return f"{level_colored} {msg}"


def configure_logging() -> None:
    try:
        import colorama

        colorama.just_fix_windows_console()
    except Exception:
        pass

    # Root logger: WARNING+ only to silence noisy third-party libraries
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.WARNING)

    use_tui = os.getenv("TUI_LOGS", "").lower() in ("1", "true", "yes")

    if use_tui:
        from utils.tui_logger import tui_handler

        handler = tui_handler(app_name="MomAI")
    else:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(ColorFormatter())

    if not root_logger.handlers:
        root_logger.addHandler(handler)

    # MomAI namespace: INFO+ for our own code
    momai_logger = logging.getLogger("momai")
    momai_logger.setLevel(logging.DEBUG if os.getenv("LOG_LEVEL", "").lower() == "debug" else logging.INFO)
    momai_logger.propagate = True  # logs flow up to root handler


def install_uvicorn_access_filter() -> None:
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

    # Silence websocket acceptance logs from uvicorn.error
    class UvicornErrorFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            return "WebSocket" not in record.getMessage()

    logging.getLogger("uvicorn.error").addFilter(UvicornErrorFilter())

    # Silence third-party HTTP client logs
    logging.getLogger("httpx").setLevel(logging.WARNING)


def patch_thread_start() -> None:
    """Monkey-patch threading.Thread.start to robustly handle race conditions."""
    original_start = threading.Thread.start

    def _safe_start(self, *args, **kwargs):
        try:
            return original_start(self, *args, **kwargs)
        except RuntimeError as exc:
            if "threads can only be started once" in str(exc):
                logger.warning(
                    "[System] SafeGuard: Thread %s already started. Ignoring.",
                    self.name,
                )
                return None
            raise

    threading.Thread.start = _safe_start
