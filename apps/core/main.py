import os
import sys
import logging

# Ensure native DLLs (VC++ Runtime, etc.) can be found in MSIX environments
if sys.platform == "win32":
    sys_root = os.environ.get("SystemRoot", r"C:\Windows")
    system32 = os.path.join(sys_root, "System32")
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
        site_pkgs = os.path.join(venv, "Lib", "site-packages")
        for pkg in ("onnxruntime", "ctranslate2"):
            dll_dirs = []
            pkg_dir = os.path.join(site_pkgs, pkg)
            if os.path.isdir(pkg_dir):
                dll_dirs.append(pkg_dir)
                for sub in ("capi", "libs"):
                    sub_dir = os.path.join(pkg_dir, sub)
                    if os.path.isdir(sub_dir):
                        dll_dirs.append(sub_dir)
            libs_dir = os.path.join(site_pkgs, f"{pkg}.libs")
            if os.path.isdir(libs_dir):
                dll_dirs.append(libs_dir)
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

logger = logging.getLogger(__name__)
logger.info("[Python] Interpreter started")


def create_app():
    from dotenv import load_dotenv
    load_dotenv()
    
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from api.router import api_router, include_routes
    include_routes()

    from startup import lifespan
    application = FastAPI(lifespan=lifespan)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(api_router)
    return application


if __name__ == "__main__":
    import uvicorn

    should_reload = os.getenv("MOMAI_DEBUG", "false").lower() == "true"
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))

    logger.info(
        "[Main] Starting MomAI Core on %s:%s (Reload: %s)", host, port, should_reload
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
