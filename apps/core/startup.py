import asyncio
import os
import threading
from contextlib import asynccontextmanager

import logging
import psutil

import app_state
from database.models import init_db

logger = logging.getLogger("momai.startup")


async def init_sidecar_task() -> None:
    """Initialize only the runtime pieces required by the Python sidecar."""
    try:
        await app_state.send_init_event("api", "Starting Python sidecar...", 40)
        await app_state.send_init_event("api", "Database connected & migrated", 70)

        # Warm extension discovery in background for faster first /plugins request.
        await app_state.send_init_event("plugins", "Loading plugin registry...", 85)
        await app_state.ensure_extension_manager_loaded()

        await app_state.send_init_event("ready", "Sidecar ready.", 100)
    except Exception as e:
        logger.exception("[Startup] Sidecar initialization failed: %s", e)
        app_state.startup_error = str(e)
        await app_state.send_init_event("error", f"Startup failed: {e}", 0)
    finally:
        app_state.system_ready.set()


@asynccontextmanager
async def lifespan(app):
    app_state.main_loop = asyncio.get_running_loop()

    # Keep DB migration at startup so settings/voice routes can query immediately.
    await asyncio.to_thread(init_db)

    asyncio.create_task(init_sidecar_task())

    def monitor_parent() -> None:
        """Exits if parent process (Electron) dies."""
        try:
            parent = psutil.Process(os.getpid()).parent()
            if parent:
                parent.wait()
                os._exit(0)
        except psutil.NoSuchProcess:
            os._exit(0)
        except Exception as e:
            app_state.logger.debug(f"[startup] parent monitor error: {e}")

    threading.Thread(target=monitor_parent, daemon=True).start()

    yield

    if app_state.ww:
        try:
            app_state.ww.stop()
        except Exception:
            pass

    try:
        import services.voice.tts as tts

        tts.stop_all()
    except Exception:
        pass

    logger.debug("[FastAPI] Sidecar shutdown complete.")
