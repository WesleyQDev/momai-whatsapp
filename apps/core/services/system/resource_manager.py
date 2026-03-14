import sys
import os
import threading
import logging
import atexit
import time
import gc

try:
    from fortscript import FortScript, Callbacks
except ImportError:
    FortScript = None
    Callbacks = None

# Delayed imports
# from database.models import SessionLocal, GamingApp, Settings
# from ai.providers.local_llama import stop_server, load_model
# import ai.orchestrator as orchestrator
# import services.voice.tts as tts

logger = logging.getLogger("momai.resource_manager")

class ResourceManager:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super(ResourceManager, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return
        
        self.fs = None
        self.thread = None
        self.lock = threading.Lock()
        self.is_gaming = False
        self.on_notify_callback = None
        self.start_time = time.time() # Track boot time
        self.inactivity_thread = None
        self.inactivity_running = False
        self.is_inactive = False
        self.initialized = True

    def start(self):
        """Initializes FortScript monitoring in a separate thread."""
        with self.lock:
            if self.thread and self.thread.is_alive():
                return

            if FortScript is None:
                logger.error("[ResourceManager] FortScript not found. Monitoring disabled.")
                return

            from database.models import SessionLocal, GamingApp
            db = SessionLocal()
            try:
                from fortscript.main import RamConfig
                
                # 1. Carrega apps configurados pelo usuário
                apps = db.query(GamingApp).filter(GamingApp.is_active == True).all()
                heavy_processes = [
                    {"name": app.name, "process": app.executable} 
                    for app in apps
                ]

                if not heavy_processes:
                    logger.info(
                        "[ResourceManager] No active game apps configured. Monitoring on standby."
                    )
                    return

                # 2. Configure Callbacks
                callbacks = Callbacks(
                    on_pause=self._enter_gaming_mode,
                    on_resume=self._exit_gaming_mode
                )

                # 3. Instancia FortScript
                # Usamos um RamConfig com valores impossíveis (200) para desativar o gatilho por memória RAM,
                # atendendo ao pedido do usuário de manter a monitoração apenas para processos (jogos).
                self.fs = FortScript(
                    heavy_process=heavy_processes,
                    callbacks=callbacks,
                    projects=[], # Não gerenciamos scripts externos aqui
                    ram_config=RamConfig(threshold=200, safe=190),
                    new_console=False
                )

                # 4. Inicia em Thread
                self.thread = threading.Thread(target=self.fs.run, daemon=True, name="FortScript-Monitor")
                self.thread.start()
                logger.info(
                    f"[ResourceManager] Monitoring started for {len(heavy_processes)} applications."
                )

            except Exception as e:
                logger.error(f"[ResourceManager] Error starting: {e}")
            finally:
                db.close()

            # Start inactivity monitor
            if not self.inactivity_thread or not self.inactivity_thread.is_alive():
                self.inactivity_running = True
                self.inactivity_thread = threading.Thread(
                    target=self._inactivity_monitor_loop, 
                    daemon=True, 
                    name="Inactivity-Monitor"
                )
                self.inactivity_thread.start()

    def _inactivity_monitor_loop(self):
        import app_state
        while self.inactivity_running:
            time.sleep(10)
            try:
                # If we are in gaming mode, resources are already suspended
                if self.is_gaming:
                    continue
                
                import ai.orchestrator as orchestrator
                
                # Check inactivity
                if not getattr(app_state, 'is_ai_busy', lambda: False)():
                    last_interaction = getattr(app_state, 'last_interaction_time', time.time())
                    # 180 seconds = 3 minutes
                    if time.time() - last_interaction > 180 and not self.is_inactive:
                        if orchestrator.llm_mode == "local" and orchestrator.llm is not None:
                            logger.info("[ResourceManager] 3 minutes of inactivity detected. Suspending AI to save resources...")
                            self._suspend_for_inactivity()
                
                # Update is_inactive state if user naturally revived it
                if self.is_inactive and orchestrator.llm is not None:
                    self.is_inactive = False
                    
            except Exception as e:
                logger.debug(f"[ResourceManager] Inactivity monitor error: {e}")

    def _suspend_for_inactivity(self):
        try:
            self.is_inactive = True
            
            from ai.embeddings import embeddings
            embeddings.stop()
            
            from ai.providers.local_llama import stop_server
            stop_server()
            
            import ai.orchestrator as orchestrator
            # Set to None so next chat will trigger on-demand init in stream processor
            orchestrator.llm = None
            orchestrator.momai_graph = None
            orchestrator.llm_mode = "waiting"
            
            if app_state.main_loop:
                import asyncio
                asyncio.run_coroutine_threadsafe(
                    app_state.broadcast_to_sockets(
                        {"type": "model_changed", "data": {"new_mode": "waiting"}}
                    ),
                    app_state.main_loop,
                )
            
            gc.collect()
            logger.info("[ResourceManager] Inactivity suspension complete.")
        except Exception as e:
            logger.error(f"[ResourceManager] Error suspending for inactivity: {e}")

    def _enter_gaming_mode(self):
        """Action executed when a game is detected."""
        if self.is_gaming:
            return
            
        # Evita ativar modo gaming por pico de RAM durante o boot (espera 30s)
        if (time.time() - self.start_time) < 30:
            logger.info("[ResourceManager] Startup period: ignoring resource triggers.")
            return

        logger.warning("[ResourceManager] !!! GAMING MODE ACTIVATED !!!")
        self.is_gaming = True
        
        # Para serviços pesados
        try:
            # Wait for AI response to finish to avoid cutting messages mid-stream
            try:
                import services.voice.tts as tts
                grace_seconds = float(os.getenv("MOMAI_GAMING_MODE_GRACE", "6"))
                start = time.time()
                # Verifica se AI ou TTS estão ocupados de forma segura
                while (getattr(app_state, 'is_ai_busy', lambda: False)() or 
                       tts.is_busy()) and (time.time() - start) < grace_seconds:
                    time.sleep(0.2)
            except Exception as e:
                logger.warning(f"[ResourceManager] Grace wait skipped: {e}")

            # Stop embeddings server first
            from ai.embeddings import embeddings
            embeddings.stop()
            
            from ai.providers.local_llama import stop_server
            import services.voice.tts as tts
            
            stop_server() # Llama.cpp (main LLM)
            tts.stop_all() # TTS
            logger.info("[ResourceManager] Heavy services suspended successfully.")
            
            # NOVO: Notificar FastAPI que está em gaming mode
            try:
                from app_state import set_gaming_mode
                set_gaming_mode(True)
            except ImportError:
                pass
            
            # NOVO: Garbage collection agressivo
            logger.info("[ResourceManager] Running aggressive garbage collection...")
            gc.collect()
            
            # NOVO: Descarregar módulos opcionais da memória
            logger.info("[ResourceManager] Unloading optional modules...")
            modules_to_unload = [
                'langchain', 'langchain_core', 'langgraph', 
                'embeddings', 'services.reminders', 'services.extensions'
            ]
            for mod_name in modules_to_unload:
                if mod_name in sys.modules:
                    try:
                        del sys.modules[mod_name]
                        logger.debug(f"[ResourceManager] Unloaded module: {mod_name}")
                    except Exception as e:
                        logger.warning(f"[ResourceManager] Failed to unload {mod_name}: {e}")
            
            # Final memory compaction
            gc.collect()
            
            if self.on_notify_callback:
                self.on_notify_callback("active")
                
        except Exception as e:
            logger.error(f"[ResourceManager] Error suspending services: {e}")

    def _exit_gaming_mode(self):
        """Action executed when the game is closed."""
        if not self.is_gaming:
            return
            
        logger.info("[ResourceManager] Gaming mode disabled. Restoring systems...")
        self.is_gaming = False
        
        try:
            # NOVO: Notificar FastAPI que saiu do gaming mode
            try:
                from app_state import set_gaming_mode
                set_gaming_mode(False)
            except ImportError:
                pass
            
            # Stop embeddings first before restarting
            from ai.embeddings import embeddings
            embeddings.stop()
            time.sleep(0.3)  # Brief buffer to ensure port is free
            
            import ai.orchestrator as orchestrator
            import services.voice.tts as tts

            # Restaura o motor local se ele estava sendo usado
            if orchestrator.llm_mode == "local":
                logger.info("[ResourceManager] Restoring Local Llama engine...")
                orchestrator.initialize_llm()
            
            # Restart embeddings
            logger.info("[ResourceManager] Restarting embeddings server...")
            embeddings.restart()
            
            # Reinicia workers de TTS
            tts.start_workers()
            
            # NOVO: Garbage collection após reload
            gc.collect()

            if self.on_notify_callback:
                self.on_notify_callback("inactive")
                
        except Exception as e:
            logger.error(f"[ResourceManager] Error during gaming mode exit: {e}")

    def stop(self):
        """
        Stops all resource management services.
        Called during application shutdown to ensure clean termination.
        """
        logger.info("[ResourceManager] Stopping resource manager...")
        try:
            # Stop embeddings server
            from ai.embeddings import embeddings
            embeddings.stop()
            
            from ai.providers.local_llama import stop_server
            import services.voice.tts as tts
            
            # Stop main llama server
            stop_server()
            
            # Stop TTS
            tts.stop_all()
            
            self.inactivity_running = False
            
            # FortScript thread is daemon, will die with process
            logger.info("[ResourceManager] Resource manager stopped successfully.")
        except Exception as e:
            logger.error(f"[ResourceManager] Error during stop: {e}")

resource_manager = ResourceManager()

# Register cleanup on exit
atexit.register(resource_manager.stop)
