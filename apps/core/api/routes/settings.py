import asyncio
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app_state
from api.deps import get_db
from api.schemas import SettingsUpdate
from database.models import SessionLocal, Settings

router = APIRouter()


def _sync_update_settings(data: SettingsUpdate):
    """Helper to perform blocking DB updates."""
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        changes = []

        if data.ai_tier is not None:
            settings.ai_tier = data.ai_tier
            changes.append("ai_tier")
            # If changing to lite, force disabled voice features
            if data.ai_tier == "lite":
                settings.tts_enabled = False
                settings.wake_word_enabled = False
                changes.extend(["tts_enabled", "wake_word_enabled"])

        if data.user_name is not None:
            settings.user_name = data.user_name
            changes.append("user_name")

        if data.assistant_persona is not None:
            settings.assistant_persona = data.assistant_persona
            changes.append("persona")

        if data.ai_provider is not None:
            settings.ai_provider = data.ai_provider
            changes.append("provider")

        if data.ai_model is not None:
            settings.ai_model = data.ai_model

        if data.local_backend is not None:
            settings.local_backend = data.local_backend
            changes.append("local_backend")

        if data.api_keys is not None:
            settings.api_keys = json.dumps(data.api_keys)

        if data.tts_voice is not None:
            settings.tts_voice = data.tts_voice

        if data.tts_enabled is not None:
            # Enforce Lite tier restriction
            settings.tts_enabled = data.tts_enabled if settings.ai_tier != "lite" else False
            if "tts_enabled" not in changes:
                changes.append("tts_enabled")

        if data.wake_word_enabled is not None:
            # Enforce Lite tier restriction
            settings.wake_word_enabled = data.wake_word_enabled if settings.ai_tier != "lite" else False
            if "wake_word_enabled" not in changes:
                changes.append("wake_word_enabled")

        if data.wake_word_sensitivity is not None:
            settings.wake_word_sensitivity = data.wake_word_sensitivity

        if data.locale is not None:
            settings.locale = data.locale

        if data.onboarding_completed is not None:
            settings.onboarding_completed = data.onboarding_completed

        if data.tutorial_completed is not None:
            settings.tutorial_completed = data.tutorial_completed

        if data.daily_briefing_enabled is not None:
            settings.daily_briefing_enabled = data.daily_briefing_enabled

        if data.auto_start_llm is not None:
            settings.auto_start_llm = data.auto_start_llm


        db.commit()
        db.refresh(settings)
        return changes, settings.ai_provider, settings.tts_voice, settings.tts_enabled, settings.wake_word_enabled, settings.ai_tier
    finally:
        db.close()


@router.get("/settings")
async def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
        db.commit()

    api_keys = {}
    try:
        api_keys = json.loads(settings.api_keys) if settings.api_keys else {}
    except Exception as e:
        app_state.logger.debug(f"[Settings] Error decoding API keys: {e}")

    return {
        "user_name": settings.user_name,
        "assistant_persona": settings.assistant_persona,
        "ai_provider": settings.ai_provider,
        "ai_model": settings.ai_model,
        "local_backend": settings.local_backend,
        "api_keys": api_keys,
        "tts_voice": settings.tts_voice,
        "tts_enabled": settings.tts_enabled,
        "wake_word_enabled": settings.wake_word_enabled,
        "wake_word_sensitivity": settings.wake_word_sensitivity,
        "locale": settings.locale or "pt-BR",
        "onboarding_completed": settings.onboarding_completed,
        "tutorial_completed": settings.tutorial_completed,
        "daily_briefing_enabled": settings.daily_briefing_enabled,
        "ai_tier": settings.ai_tier,
        "auto_start_llm": settings.auto_start_llm
    }


@router.patch("/settings")
async def update_settings(data: SettingsUpdate):
    changes, provider, tts_voice, tts_enabled, ww_enabled, current_tier = await asyncio.to_thread(_sync_update_settings, data)

    if data.tts_voice is not None:
        app_state.tts.tts.set_voice(tts_voice)

    if "tts_enabled" in changes or data.tts_enabled is not None:
        app_state.tts.tts.set_enabled(tts_enabled)

    if "wake_word_enabled" in changes or data.wake_word_enabled is not None:
        if app_state.ww:
            if ww_enabled:
                app_state.ww.start()
            else:
                app_state.ww.stop()

    if any(change in changes for change in ["persona", "user_name", "provider", "local_backend", "ai_tier"]):
        # Always re-initialize local LLM
        app_state.initialize_llm(tier=current_tier)
        await app_state.broadcast_to_sockets({"type": "model_changed", "data": {"new_mode": "local"}})

    # Se o onboarding acabou de ser concluído, inicia os serviços core
    if data.onboarding_completed is True:
        from startup import start_core_services
        # Busca configurações atualizadas para o startup
        db = SessionLocal()
        settings = db.query(Settings).first()
        db.close()
        asyncio.create_task(start_core_services(settings))


@router.post("/settings/voice-sample")
async def play_voice_sample(data: dict):
    voice = data.get("voice")
    text = data.get("text", "Olá, eu sou sua assistente MomAI.")
    
    if voice:
        app_state.tts.tts.set_voice(voice)
        app_state.tts.tts.speak(text)
    
    return {"status": "playing"}
