from fastapi import APIRouter

api_router = APIRouter()


def include_routes():
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[Router] Registering API routes...")
    
    logger.info("[Router] Importing route modules...")
    
    import time
    start = time.time()
    
    def load_route(name, import_func):
        s = time.time()
        res = import_func()
        logger.info(f"  - {name} loaded in {time.time() - s:.2f}s")
        return res

    chat = load_route("chat", lambda: __import__("api.routes.chat", fromlist=["router"]))
    voice = load_route("voice", lambda: __import__("api.routes.voice", fromlist=["router"]))
    reminders = load_route("reminders", lambda: __import__("api.routes.reminders", fromlist=["router"]))
    settings = load_route("settings", lambda: __import__("api.routes.settings", fromlist=["router"]))
    setup = load_route("setup", lambda: __import__("api.routes.setup", fromlist=["router"]))
    memory = load_route("memory", lambda: __import__("api.routes.memory", fromlist=["router"]))
    gaming = load_route("gaming", lambda: __import__("api.routes.gaming", fromlist=["router"]))
    extensions = load_route("extensions", lambda: __import__("api.routes.extensions", fromlist=["router"]))
    mode = load_route("mode", lambda: __import__("api.routes.mode", fromlist=["router"]))
    status = load_route("status", lambda: __import__("api.routes.status", fromlist=["router"]))
    init_status = load_route("init_status", lambda: __import__("api.routes.init_status", fromlist=["router"]))
    hardware = load_route("hardware", lambda: __import__("api.routes.hardware", fromlist=["router"]))
    ws = load_route("ws", lambda: __import__("api.routes.ws", fromlist=["router"]))
    diagnostic = load_route("diagnostic", lambda: __import__("api.routes.diagnostic", fromlist=["router"]))
    
    logger.info(f"[Router] Route modules imported in {time.time() - start:.2f}s")
    logger.info("[Router] Attaching routers to main router...")

    api_router.include_router(chat.router)
    api_router.include_router(voice.router)
    api_router.include_router(reminders.router)
    api_router.include_router(settings.router)
    api_router.include_router(setup.router)
    api_router.include_router(memory.router)
    api_router.include_router(gaming.router)
    api_router.include_router(extensions.router)
    api_router.include_router(mode.router)
    api_router.include_router(status.router)
    api_router.include_router(init_status.router)
    api_router.include_router(hardware.router)
    api_router.include_router(ws.router)
    api_router.include_router(diagnostic.router)
    logger.info("[Router] All routes registered successfully.")

# include_routes()
