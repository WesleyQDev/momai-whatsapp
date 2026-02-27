import asyncio
import os
import threading
import time
from contextlib import asynccontextmanager

import psutil

import logging
logger = logging.getLogger("momai.startup")
logger.info("[Startup] Loading startup module...")

import app_state
from database.models import SessionLocal, Settings, init_db
from services.system.resource_manager import resource_manager

logger.info("[Startup] Startup module loaded.")


async def init_system_task() -> None:
    """Background task to initialize the system with granular progress reporting."""
    try:
        # Scale: 30% - 100% (Electron takes 0% - 30%)
        await app_state.send_init_event("api", "Starting system protocols...", 32)
        
        # O init_db já foi chamado na lifespan de forma síncrona
        await app_state.send_init_event("api", "Database connected & migrated", 35)

        await app_state.send_init_event("brain", "Loading AI stack modules...", 40)
        await app_state.initialize_ai_stack()
        await app_state.send_init_event("brain", "Core AI modules ready", 45)

        db = SessionLocal()
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings()
            db.add(settings)
            db.commit()
            db.refresh(settings)

        if not settings.onboarding_completed:
            await app_state.send_init_event("ready", "Aguardando conclusão do onboarding...", 100)
            app_state.system_ready.set()
            db.close()
            return

        await start_core_services(settings)
        db.close()
    except Exception as e:
        app_state.logger.error(f"[Startup] Error in startup sequence: {e}")


async def start_core_services(settings):
    """Inicializa todos os serviços da IA após o onboarding estar concluído."""
    global checkpointer_cm
    
    # Evita inicializar múltiplas vezes se já estiver pronto
    if app_state.last_init_event.get("progress", 0) >= 100 and \
       app_state.last_init_event.get("stage") != "ready":
        return

    try:
        # 1. Start LLM initialization in background
        def on_brain_init(status: str) -> None:
            if app_state.main_loop:
                asyncio.run_coroutine_threadsafe(
                    app_state.send_init_event("brain", f"LLM: {status}", None), app_state.main_loop
                )

        if getattr(settings, "auto_start_llm", True):
            app_state.orchestrator.initialize_llm(on_brain_init)
        else:
            if app_state.main_loop:
                asyncio.run_coroutine_threadsafe(
                    app_state.send_init_event(
                        "brain", "LLM local não iniciado automaticamente (auto_start_llm=False)", None
                    ),
                    app_state.main_loop,
                )

        # 2. Load skills sequentially for progress feedback
        def load_extensions():
            try:
                def report_ext(msg):
                    if app_state.main_loop:
                        asyncio.run_coroutine_threadsafe(
                            app_state.send_init_event("extensions", msg, None),
                            app_state.main_loop,
                        )

                app_state.extension_manager.load_all(on_progress=report_ext)
                skill_count = len(app_state.extension_manager.get_all_skills())
                if app_state.main_loop:
                    asyncio.run_coroutine_threadsafe(
                        app_state.send_init_event(
                            "extensions", f"{skill_count} skills discovered", None
                        ),
                        app_state.main_loop,
                    )
            except Exception as e:
                app_state.logger.warning(f"[startup] Extensions load error: {e}")

        threading.Thread(target=load_extensions, daemon=True).start()

        # 3. Apply settings
        await app_state.send_init_event("brain", "Applying user preferences...", None)
        app_state.tts.tts.set_voice(settings.tts_voice)
        app_state.tts.tts.set_enabled(settings.tts_enabled)

        resource_manager.on_notify_callback = app_state.notify_economy_change
        resource_manager.start()
        await app_state.send_init_event("extensions", "Resource monitor active", None)

        # 5. Checkpointer Setup
        await app_state.send_init_event("api", "Setting up session persistence...", None)
        try:
            from ai.orchestrator import AsyncSqliteSaver, CHECKPOINT_PATH
            import sqlite3

            checkpointer_cm = AsyncSqliteSaver.from_conn_string(CHECKPOINT_PATH)
            app_state.orchestrator.checkpointer = await checkpointer_cm.__aenter__()
            app_state.orchestrator.checkpointer_cleanup = checkpointer_cm

            conn = sqlite3.connect(CHECKPOINT_PATH)
            conn.execute("PRAGMA journal_mode=WAL")

            def _get_columns(table_name: str) -> set[str]:
                cols = set()
                try:
                    for row in conn.execute(f"PRAGMA table_info({table_name})"):
                        cols.add(str(row[1]))
                except Exception:
                    pass
                return cols

            expected_checkpoints = {
                "thread_id", "checkpoint_ns", "checkpoint_id", "parent_checkpoint_id", 
                "type", "checkpoint", "metadata"
            }
            expected_writes = {
                "thread_id", "checkpoint_ns", "checkpoint_id", "task_id", 
                "idx", "channel", "type", "value"
            }

            checkpoints_cols = _get_columns("checkpoints")
            writes_cols = _get_columns("writes")

            if checkpoints_cols and not expected_checkpoints.issubset(checkpoints_cols):
                conn.execute("DROP TABLE IF EXISTS checkpoints")
                checkpoints_cols = set()
            if writes_cols and not expected_writes.issubset(writes_cols):
                conn.execute("DROP TABLE IF EXISTS writes")
                writes_cols = set()

            if not checkpoints_cols:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS checkpoints (
                        thread_id TEXT NOT NULL,
                        checkpoint_ns TEXT NOT NULL DEFAULT '',
                        checkpoint_id TEXT NOT NULL,
                        parent_checkpoint_id TEXT,
                        type TEXT,
                        checkpoint BLOB,
                        metadata BLOB,
                        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
                    )
                """)

            if not writes_cols:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS writes (
                        thread_id TEXT NOT NULL,
                        checkpoint_ns TEXT NOT NULL DEFAULT '',
                        checkpoint_id TEXT NOT NULL,
                        task_id TEXT NOT NULL,
                        idx INTEGER NOT NULL,
                        channel TEXT NOT NULL,
                        type TEXT,
                        value BLOB,
                        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
                    )
                """)

            conn.commit()
            conn.close()
        except Exception as exc:
            app_state.logger.exception("[Main] Checkpointer Error: %s", exc)

        # 6. Services
        await app_state.send_init_event("api", "Starting background managers...", None)
        try:
            app_state.reminder_manager = app_state.ReminderManager(
                broadcast_callback=app_state.broadcast_to_sockets,
                tts_callback=app_state.tts.speak_sentence,
            )
            app_state.reminder_manager.start()
        except Exception as e:
            app_state.logger.warning(f"[startup] Reminder manager error: {e}")

        # 7. Wake Word
        def start_wake_word():
            try:
                # Lite tier never has Wake Word
                if settings.ai_tier == "lite":
                    return
                    
                if not settings.wake_word_enabled:
                    return

                def on_wake_word(text: str) -> None:
                    if app_state.main_loop:
                        asyncio.run_coroutine_threadsafe(
                            app_state.process_voice_command(text), app_state.main_loop
                        )

                def on_voice_status(status: str) -> None:
                    if app_state.main_loop:
                        asyncio.run_coroutine_threadsafe(
                            app_state.broadcast_to_sockets(
                                {"type": "voice_status", "status": status}
                            ),
                            app_state.main_loop,
                        )

                def on_voice_partial(text: str) -> None:
                    if app_state.main_loop:
                        asyncio.run_coroutine_threadsafe(
                            app_state.broadcast_to_sockets(
                                {"type": "voice_partial", "text": text}
                            ),
                            app_state.main_loop,
                        )

                def should_bypass_wake_word() -> bool:
                    state = app_state.get_graph_state()
                    return app_state.is_call_mode() or (
                        state["view"] is not None and state["bypass_wake_word"]
                    )

                if app_state.main_loop:
                    asyncio.run_coroutine_threadsafe(
                        app_state.send_init_event(
                            "brain", "Initializing voice capture...", None
                        ),
                        app_state.main_loop,
                    )

                try:
                    from services.voice.detector import WakeWordDetector
                except Exception as import_err:
                    app_state.logger.warning(f"[startup] WakeWordDetector import failed: {import_err}")
                    WakeWordDetector = None

                if WakeWordDetector:
                    app_state.ww = WakeWordDetector(
                        keyword="Luna",
                        callback=on_wake_word,
                        status_callback=on_voice_status,
                        partial_callback=on_voice_partial,
                        bypass_condition=should_bypass_wake_word,
                        variants=["Luna", "Loona", "Luhna", "Lana", "Lonna", "Lona", "Nuna"],
                    )
                    app_state.ww.start()
            except Exception as e:
                app_state.logger.warning(f"[startup] Wake word error: {e}")

        threading.Thread(target=start_wake_word, daemon=True).start()

        # 8. Final Sync
        await app_state.send_init_event("brain", "Synchronizing local intelligence...", None)
        await asyncio.to_thread(
            app_state.orchestrator.llm_ready_event.wait, timeout=30.0
        )

        if settings.tts_enabled and settings.ai_tier != "lite":
            await app_state.send_init_event("voice", "Waking up local voice...", None)
            app_state.tts.tts.initialize() # New explicit call
            await asyncio.to_thread(app_state.tts.tts.wait_until_ready, timeout=10.0)

        # Marcar como totalmente pronto
        app_state.system_ready.set()
        await app_state.send_init_event("brain", "Sistema operacional e pronto.", 100)
        
        # 9. Check Daily Briefing
        try:
            from services.system.briefing import check_and_run_daily_briefing
            asyncio.create_task(check_and_run_daily_briefing())
        except Exception as e:
            app_state.logger.warning(f"[startup] Daily briefing error: {e}")
        
    except Exception as exc:
        app_state.logger.exception("[InitTask] Fatal error in core services: %s", exc)
        await app_state.send_init_event("error", f"Error: {str(exc)}", 0)


@asynccontextmanager
async def lifespan(app):
    app_state.main_loop = asyncio.get_running_loop()

    # Inicializa banco de dados SINCRONAMENTE antes de abrir para requisições
    # Isso evita o erro "no such table: messages" em máquinas rápidas
    await asyncio.to_thread(init_db)

    # Start all initialization tasks in parallel
    asyncio.create_task(init_system_task())
    asyncio.create_task(app_state.broadcast_resource_usage())

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

    if os.name == "nt":
        threading.Thread(target=monitor_parent, daemon=True).start()
    else:
        threading.Thread(target=monitor_parent, daemon=True).start()

    yield

    if app_state.ww:
        app_state.ww.stop()
    if app_state.reminder_manager:
        app_state.reminder_manager.stop()
    resource_manager.stop()

    if (
        app_state.orchestrator
        and hasattr(app_state.orchestrator, "checkpointer_cleanup")
        and app_state.orchestrator.checkpointer_cleanup
    ):
        try:
            await app_state.orchestrator.checkpointer_cleanup.__aexit__(
                None, None, None
            )
            app_state.logger.info("[Main] Checkpointer closed.")
        except Exception as exc:
            app_state.logger.exception("[Main] Error closing checkpointer: %s", exc)

    app_state.logger.info("[FastAPI] Shutting down...")

    try:
        from ai.embeddings import embeddings

        embeddings.stop()
        app_state.logger.info("[FastAPI] Embeddings server stopped.")
    except Exception as exc:
        app_state.logger.exception("[FastAPI] Error stopping embeddings: %s", exc)

    if app_state.reminder_manager:
        try:
            app_state.reminder_manager.stop()
            app_state.logger.info("[FastAPI] Reminder manager stopped.")
        except Exception as exc:
            app_state.logger.exception(
                "[FastAPI] Error stopping reminder manager: %s", exc
            )

    if app_state.ww:
        try:
            app_state.ww.stop()
            app_state.logger.info("[FastAPI] Wake word detector stopped.")
        except Exception as exc:
            app_state.logger.exception(
                "[FastAPI] Error stopping wake word detector: %s", exc
            )

    try:
        from ai.providers.local_llama import stop_server

        stop_server()
        app_state.logger.info("[FastAPI] Main LLM server stopped.")
    except Exception as exc:
        app_state.logger.exception("[FastAPI] Error stopping LLM server: %s", exc)

    try:
        if app_state.tts:
            app_state.tts.stop_all()
            app_state.logger.info("[FastAPI] TTS workers stopped.")
    except Exception as exc:
        app_state.logger.exception("[FastAPI] Error stopping TTS: %s", exc)

    time.sleep(0.5)
    app_state.logger.info("[FastAPI] Shutdown complete.")
