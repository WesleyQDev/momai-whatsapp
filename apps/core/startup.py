import asyncio
import os
import threading
from contextlib import asynccontextmanager

import logging
import psutil

import app_state
from database.models import init_db, SessionLocal, Settings

logger = logging.getLogger("momai.startup")


async def prewarm_tts_if_needed() -> None:
    """Pre-initialize TTS in background to reduce first-response latency."""
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
    finally:
        db.close()

    ai_tier = (settings.ai_tier if settings else None) or "pro"
    tts_enabled = True if not settings else bool(settings.tts_enabled)

    if ai_tier == "lite":
        logger.info("[Startup] TTS prewarm skipped: ai_tier=lite")
        return
    if not tts_enabled:
        logger.info("[Startup] TTS prewarm skipped: settings.tts_enabled=false")
        return

    tts_module = app_state.ensure_tts_runtime(prewarm=True)
    if not tts_module:
        logger.warning("[Startup] TTS prewarm skipped: runtime unavailable")
        return

    if settings and settings.tts_voice:
        try:
            tts_module.tts.set_voice(settings.tts_voice)
        except Exception as e:
            logger.warning("[Startup] Failed to set TTS voice during prewarm: %s", e)

    start = asyncio.get_running_loop().time()
    ready = await asyncio.to_thread(tts_module.tts.wait_until_ready, 30.0)
    elapsed = asyncio.get_running_loop().time() - start
    if ready:
        logger.info("[Startup] TTS prewarm ready in %.1fs", elapsed)
    else:
        logger.warning("[Startup] TTS prewarm timeout after %.1fs", elapsed)


async def init_sidecar_task() -> None:
    """Initialize only the runtime pieces required by the Python sidecar."""
    try:
        await app_state.send_init_event("api", "Starting Python sidecar...", 40)
        await app_state.send_init_event("api", "Database connected & migrated", 70)

        # Warm voice runtime in background so first automatic TTS is faster.
        await app_state.send_init_event("voice", "Warming up TTS engine...", 92)
        asyncio.create_task(prewarm_tts_if_needed())

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
