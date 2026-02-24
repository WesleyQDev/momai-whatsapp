import os
print("[Python] Interpreter started", flush=True)
import logging

os.environ["TOKENIZERS_PARALLELISM"] = "false"

from runtime import configure_logging, install_uvicorn_access_filter, patch_thread_start

configure_logging()
install_uvicorn_access_filter()
patch_thread_start()

logger = logging.getLogger(__name__)


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
