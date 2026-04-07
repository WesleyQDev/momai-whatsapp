"""Early model prefetch — starts GGUF download in parallel with AI stack import.

Called at two points to cover both fresh-install and returning-user scenarios:
  1. lifespan() right after init_db()  → catches returning users (model cached)
  2. start_core_services()             → catches first launch (after onboarding)

Design:
    - SRP: only responsible for ensuring the model file exists on disk.
    - Idempotent: safe to call multiple times; skipped runs allow retries.
    - Non-blocking: runs in a daemon thread, never blocks the main loop.
    - Non-fatal: all errors are logged and swallowed.
"""

import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger("momai.prefetch")

_lock = threading.Lock()
_running = False
_downloaded = False


def start_model_prefetch(tier_override: str | None = None) -> None:
    """Kick off model download in a daemon thread.

    Args:
        tier_override: When provided, skip DB settings lookup and use
                       this tier directly. Used during onboarding when
                       the tier was just selected but not yet persisted.
    """
    global _running
    with _lock:
        if _running or _downloaded:
            return
        _running = True
    threading.Thread(
        target=_worker,
        args=(tier_override,),
        name="model-prefetch",
        daemon=True,
    ).start()


def _worker(tier_override: str | None = None) -> None:
    """Background task: resolve tier config and ensure model file exists."""
    global _running, _downloaded
    try:
        tier, config = _resolve_tier_config(tier_override)
        if not tier or not config:
            return

        repo_id = config["repo"]
        filename = config["file"]
        models_dir = _resolve_models_dir()

        if (models_dir / filename).exists():
            logger.info("[Prefetch] Model already cached: %s", filename)
            _downloaded = True
            return

        logger.info("[Prefetch] Early download: %s/%s", repo_id, filename)
        _notify("Pre-downloading AI model...")
        _download_model(repo_id, filename, models_dir)
        _downloaded = True
        _notify("Model pre-downloaded")

    except Exception as exc:
        logger.warning("[Prefetch] Non-fatal error: %s", exc)
    finally:
        with _lock:
            _running = False


def _resolve_models_dir() -> Path:
    """Resolve the models directory (same logic as local_llama.get_paths)."""
    env_path = os.environ.get("MOMAI_CORE_PATH")
    base_dir = Path(env_path) if env_path else Path(__file__).parent.parent
    return base_dir / "models"


def _resolve_tier_config(
    tier_override: str | None = None,
) -> tuple[str | None, dict | None]:
    """Read DB settings and tier JSON to determine required model."""
    try:
        if tier_override:
            tier = tier_override
        else:
            from database.models import SessionLocal, Settings

            db = SessionLocal()
            try:
                settings = db.query(Settings).first()
                if not settings or not settings.onboarding_completed:
                    logger.info("[Prefetch] Onboarding pending, skipping")
                    return None, None

                tier = getattr(settings, "ai_tier", None)
                if not tier:
                    logger.info("[Prefetch] No tier selected, skipping")
                    return None, None

                if not getattr(settings, "auto_start_llm", True):
                    logger.info("[Prefetch] auto_start_llm disabled, skipping")
                    return None, None
            finally:
                db.close()

        config_path = os.path.join(os.path.dirname(__file__), "..", "ai_tiers.json")

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                tier_config = json.load(f)
        except Exception:
            tier_config = {}

        if tier not in tier_config:
            tier = "pro"
        if tier not in tier_config:
            return None, None

        return tier, tier_config[tier]

    except Exception as exc:
        logger.warning("[Prefetch] Config resolution failed: %s", exc)
        return None, None


def _download_model(repo_id: str, filename: str, models_dir: Path) -> None:
    """Download GGUF from HuggingFace Hub (thread-safe, idempotent)."""
    old_offline = os.environ.get("HF_HUB_OFFLINE")
    os.environ["HF_HUB_OFFLINE"] = "0"
    try:
        from huggingface_hub import hf_hub_download

        try:
            hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=models_dir,
                progress_callback=lambda cur, tot: _notify(
                    f"Downloading model: {cur / 1024 / 1024:.0f}MB / {tot / 1024 / 1024:.0f}MB"
                )
                if tot > 0
                else None,
            )
        except TypeError:
            hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=models_dir,
            )

        logger.info("[Prefetch] Download complete: %s", filename)

    finally:
        if old_offline is not None:
            os.environ["HF_HUB_OFFLINE"] = old_offline
        else:
            os.environ["HF_HUB_OFFLINE"] = "1"


def _notify(message: str) -> None:
    """Best-effort progress notification via WebSocket."""
    try:
        import asyncio

        import app_state

        loop = app_state.main_loop
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(
                app_state.send_init_event("brain", message, None),
                loop,
            )
    except Exception:
        pass
