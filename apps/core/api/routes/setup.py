import asyncio
import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app_state
from api.deps import get_db
from api.schemas import InstallRequest
from database.models import Settings
import utils.downloader as downloader


def _get_base_dir():
    env_path = os.environ.get("MOMAI_CORE_PATH")
    if env_path:
        return Path(env_path)
    return Path(__file__).parent.parent.parent


router = APIRouter()


@router.get("/setup/status")
async def get_setup_status(db: Session = Depends(get_db)):
    """Verifica status detalhado da instalacao local."""

    def _get_status():
        settings = db.query(Settings).first()
        user_backend_pref = settings.local_backend if settings else "auto"

        engine_ok = downloader.check_engine_installed()
        models_path = _get_base_dir() / "models"
        models_ok = any(models_path.glob("*.gguf"))

        install_info = downloader.get_installed_info()
        hw_info = downloader.get_hardware_info()
        installed_backends = downloader.get_all_installed_backends()

        latest_v = downloader.get_latest_llama_version()

        # Resolve 'auto' to the actual backend that will be used
        if user_backend_pref == "auto":
            resolved_backend = hw_info.get("backend", "cpu")
        else:
            resolved_backend = user_backend_pref

        return {
            "engine_installed": engine_ok,
            "models_installed": models_ok,
            "detected_hardware": hw_info.get("gpu_name") or "Nao Detectada",
            "cpu_name": hw_info.get("cpu_name"),
            "recommended_build": hw_info.get("backend"),
            "available_builds": downloader.get_available_builds(latest_v),
            "latest_version": latest_v,
            "installed_version": install_info.get("version") if install_info else None,
            "installed_build": install_info.get("build_type") if install_info else None,
            "installed_backends": installed_backends,
            "current_local_backend": resolved_backend,
            "os_name": downloader.platform.system().lower(),
        }

    return await asyncio.to_thread(_get_status)


@router.post("/setup/install-engine")
async def install_engine(req: InstallRequest | None = None):
    """Inicia o download do motor Llama.cpp."""
    loop = asyncio.get_running_loop()
    forced = req.backend if req else None

    def sync_report_progress(percent: int) -> None:
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets(
                {
                    "type": "setup_progress",
                    "data": {"step": "download_engine", "percent": percent},
                }
            ),
            loop,
        )

    try:
        success = await asyncio.to_thread(
            downloader.setup_local_engine, sync_report_progress, forced
        )

        if success:
            await app_state.broadcast_to_sockets(
                {"type": "setup_complete", "data": {"step": "download_engine"}}
            )
            return {"status": "ok"}
        return {"status": "error", "message": "Falha no download ou instalacao"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@router.delete("/setup/uninstall-engine")
async def uninstall_engine(backend: str | None = None):
    """Remove o motor local."""
    try:
        from ai.providers.local_llama import stop_server

        stop_server()
    except Exception as e:
        app_state.logger.debug(f"[Setup] Error stopping server during uninstall: {e}")

    success = downloader.uninstall_engine(backend)
    if success:
        return {"status": "ok"}
    return {"status": "error", "message": "Falha ao remover arquivos"}


# AI Tiers Configuration (lazy-loaded to avoid importing orchestrator at module level)
import json as _json

def _load_tier_config():
    config_path = os.path.join(os.path.dirname(__file__), "..", "..", "ai_tiers.json")
    defaults = {
        "lite": {"repo": "unsloth/LFM2.5-VL-1.6B-GGUF", "file": "LFM2.5-VL-1.6B-Q4_K_M.gguf", "temperature": 0.1, "top_p": 0.8, "top_k": 20},
        "pro": {"repo": "LiquidAI/LFM2.5-1.2B-Instruct-GGUF", "file": "LFM2.5-1.2B-Instruct-Q4_K_M.gguf", "temperature": 0.1, "top_p": 0.8, "top_k": 20},
        "ultra": {"repo": "unsloth/Qwen3-4B-Instruct-2507-GGUF", "file": "Qwen3-4B-Instruct-2507-UD-Q4_K_XL.gguf", "temperature": 0.1, "top_p": 0.8, "top_k": 20},
    }
    if not os.path.exists(config_path):
        return defaults
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return _json.load(f)
    except Exception:
        return defaults

def _build_tiers():
    tier_config = _load_tier_config()
    return {
        "lite": {
            **tier_config["lite"],
            "voice": False,
            "wake_word": False,
            "persona": "Você é MomAI Lite, uma assistente rápida e eficiente. Seu foco é utilidade direta."
        },
        "pro": {
            **tier_config["pro"],
            "voice": True,
            "wake_word": False,
            "persona": "Você é MomAI Pro, uma assistente equilibrada e inteligente. Você ajuda o usuário com tarefas complexas de forma eficiente."
        },
        "ultra": {
            **tier_config["ultra"],
            "voice": True,
            "wake_word": True,
            "persona": "Você é MomAI Ultra, a experiência máxima em inteligência local. Você é proativa, inteligente e capaz de ouvir e falar com o usuário fluentemente."
        }
    }

TIERS = _build_tiers()


@router.post("/setup/apply-tier")
async def apply_tier(tier: str, db: Session = Depends(get_db)):
    """Aplica o nível de IA selecionado e inicia downloads."""
    if tier not in TIERS:
        return {"status": "error", "message": "Nível inválido"}

    config = TIERS[tier]
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)

    settings.ai_tier = tier
    settings.tts_enabled = config["voice"]
    settings.wake_word_enabled = config["wake_word"]
    settings.assistant_persona = config["persona"]
    db.commit()

    # Inicia instalação de componentes adicionais
    async def background_install():
        def report_setup(msg):
            asyncio.run_coroutine_threadsafe(
                app_state.broadcast_to_sockets({
                    "type": "setup_progress",
                    "data": {"step": "additional_components", "message": msg}
                }),
                app_state.main_loop
            )

        try:
            # Start model download ASAP — runs in parallel with voice/component setup below
            from ai.model_prefetch import start_model_prefetch
            start_model_prefetch(tier_override=tier)

            # 1. Component Cleanup
            from services.voice.tts import tts
            if not config.get("voice"):
                report_setup("Desativando sistema de voz...")
                tts.stop()
                tts.set_enabled(False)
            
            if tier != "ultra":
                if hasattr(app_state, "ww") and app_state.ww:
                    report_setup("Desativando detector de voz...")
                    app_state.ww.stop()
                    app_state.ww = None
                
                # Stop embedding server for non-ultra tiers
                from ai.embeddings import embeddings
                embeddings.stop()

            # 2. Pre-aquecer Voz se habilitado (Pro e Ultra)
            if config.get("voice"):
                report_setup("Finalizando configuração de voz...")
                tts.set_enabled(True)
                tts.initialize()
                await asyncio.to_thread(tts.wait_until_ready, timeout=60)
            
            # 3. Pre-aquecer Wake Word se Ultra
            if tier == "ultra":
                report_setup("Instalando componentes de áudio...")
                from services.voice.detector import WakeWordDetector
                
                if not app_state.ww:
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

                    app_state.ww = WakeWordDetector(
                        keyword="Luna",
                        callback=on_wake_word,
                        status_callback=on_voice_status,
                        partial_callback=on_voice_partial,
                        bypass_condition=should_bypass_wake_word,
                        variants=["Luna", "Loona", "Luhna", "Lana", "Lonna", "Lona", "Nuna"],
                    )
                    app_state.ww.start()

            await app_state.broadcast_to_sockets({
                "type": "setup_complete",
                "data": {"step": "tier_installation", "tier": tier}
            })
            
            # Re-inicializa o LLM com o novo modelo
            app_state.orchestrator.initialize_llm(tier=tier, onboarding_bypass=True)
            
        except Exception as e:
            app_state.logger.error(f"[Setup] Tier install error: {e}")
            await app_state.broadcast_to_sockets({
                "type": "setup_error",
                "data": {"message": f"Erro na instalação do nível {tier}: {str(e)}"}
            })

    asyncio.create_task(background_install())
    
    return {"status": "ok", "message": f"Nível {tier} está sendo configurado"}
