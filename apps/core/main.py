import os
import sys
import logging
from pathlib import Path

# Force UTF-8 encoding for Windows console (must be before any imports that use stdout)
if sys.platform == "win32":
    import ctypes
    try:
        ctypes.windll.kernel32.SetConsoleCP(65001)
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    except Exception:
        pass
    os.environ["PYTHONIOENCODING"] = "utf-8"
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

# Ensure native DLLs (VC++ Runtime, etc.) can be found in MSIX environments
if sys.platform == "win32":
    sys_root = os.environ.get("SystemRoot", r"C:\Windows")
    system32 = str(Path(sys_root) / "System32")
    current_path = os.environ.get("PATH", "")
    if system32.lower() not in current_path.lower():
        os.environ["PATH"] = system32 + ";" + sys_root + ";" + current_path
    try:
        os.add_dll_directory(system32)
    except (OSError, AttributeError):
        pass
    # Also add venv site-packages DLL dirs (onnxruntime, ctranslate2)
    venv = os.environ.get("VIRTUAL_ENV")
    if venv:
        site_pkgs = Path(venv) / "Lib" / "site-packages"
        for pkg in ("onnxruntime", "ctranslate2"):
            dll_dirs = []
            pkg_dir = site_pkgs / pkg
            if pkg_dir.is_dir():
                dll_dirs.append(str(pkg_dir))
                for sub in ("capi", "libs"):
                    sub_dir = pkg_dir / sub
                    if sub_dir.is_dir():
                        dll_dirs.append(str(sub_dir))
            libs_dir = site_pkgs / f"{pkg}.libs"
            if libs_dir.is_dir():
                dll_dirs.append(str(libs_dir))
            for d in dll_dirs:
                try:
                    os.add_dll_directory(d)
                except (OSError, AttributeError):
                    pass
                if d.lower() not in current_path.lower():
                    os.environ["PATH"] = d + ";" + os.environ["PATH"]

os.environ["TOKENIZERS_PARALLELISM"] = "false"

from runtime import configure_logging, install_uvicorn_access_filter, patch_thread_start

configure_logging()
install_uvicorn_access_filter()
patch_thread_start()

logger = logging.getLogger("momai.main")
logger.info("[Python] Interpreter started")


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "file://",
]


def create_app():
    from dotenv import load_dotenv
    load_dotenv()
    
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from slowapi.errors import RateLimitExceeded
    from api.middleware.rate_limit import build_limiter, rate_limit_exceeded_handler
    from api.middleware.error_handler import sanitize_message
    from api.router import api_router, include_routes
    include_routes()

    from startup import lifespan
    application = FastAPI(lifespan=lifespan)
    application.state.limiter = build_limiter()
    application.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    async def global_exception_handler(request: Request, exc: Exception):
        import logging
        logging.getLogger("momai.api").exception(
            "Unhandled exception in route", exc_info=exc
        )
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": sanitize_message(str(exc))},
        )

    application.add_exception_handler(Exception, global_exception_handler)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=None,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    application.include_router(api_router)
    return application


if __name__ == "__main__":
    import uvicorn

    should_reload = os.getenv("MOMAI_DEBUG", "false").lower() == "true"
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))

    logger.info(
        "[Main] Starting MomAI Core on %s:%s (debug=%s)", host, port, should_reload
    )
    
    app = create_app()
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=should_reload,
        loop="asyncio",
        http="httptools",
        factory=False,
        use_colors=not should_reload,
        log_config=None,
    )
