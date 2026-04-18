import json
import logging
import os
import re
import asyncio
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional
from langchain_core.messages import HumanMessage, AIMessage

from database.models import SessionLocal, Message, ConversationSummary, Settings
from utils.i18n import t, get_locale
from utils.tokenizer import count_message_tokens, get_context_window, count_tokens
from ai.graph.prompts import SUMMARY_SYSTEM_PROMPT
from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
)

logger = logging.getLogger("momai.ai.utils")

# Configuration Constants (moved from orchestrator)
SUMMARY_BUDGET_PCT = float(os.getenv("MOMAI_CTX_BUDGET_PCT", "0.7"))
SUMMARY_RECENT_PCT = float(os.getenv("MOMAI_CTX_RECENT_PCT", "0.6"))

# Global state
llm_mode = "waiting"
is_loading = False
cancel_generation = False

def request_cancel_generation() -> None:
    global cancel_generation
    cancel_generation = True

def clear_cancel_generation() -> None:
    global cancel_generation
    cancel_generation = False

# Constants
EXTENSIONS_STORE_ACTION = "open_extensions_store"
ULTRA_MODE_ACTION = "open_settings_ultra"

_MISSING_CAPABILITY_PATTERNS = [
    r"acesso negado",
    r"nao tenho acesso",
    r"não tenho acesso",
    r"nao tenho como",
    r"não tenho como",
    r"nao fui treinad",
    r"não fui treinad",
    r"i can't (perform|do) that",
    r"i don't have access",
    r"i do not have access",
    r"não possuo essa funcionalidade",
    r"não tenho essa ferramenta",
    r"não consigo realizar essa ação",
    r"essa funcionalidade não está disponível no modo lite",
    r"essa ferramenta não está disponível no modo lite",
    r"essa funcionalidade não está disponível no modo pro",
    r"essa ferramenta não está disponível no modo pro",
    r"mude para o modo ultra",
    r"modos pro ou lite não possuem",
    r"não tenho acesso à internet",
    r"não posso buscar",
    r"sem acesso à internet",
    r"sem conexão com a internet",
    r"não consigo criar notas",
    r"não consigo criar lembretes",
    r"não posso agendar",
    r"sem acesso à sua agenda",
    r"ferramenta de notas desativada",
    r"ferramenta de lembretes desativada",
    r"acesso à internet desativado",
    r"switch to ultra mode",
    r"not available in lite mode",
    r"not available in pro mode",
    r"no internet access",
    r"can't access the internet",
]

def save_message_to_db(
    thread_id: str,
    role: str,
    content: str,
    activities: list = None,
    graph_data: dict = None,
    sources: list = None,
    snippets: list = None,
    cards: list = None,
):
    db = SessionLocal()
    try:
        activities_json = json.dumps(activities) if activities else None
        graph_data_json = json.dumps(graph_data) if graph_data else None
        sources_json = json.dumps(sources) if sources else None
        snippets_json = json.dumps(snippets) if snippets else None
        cards_json = json.dumps(cards) if cards else None
        msg = Message(
            thread_id=thread_id,
            role=role,
            content=content,
            activities=activities_json,
            graph_data=graph_data_json,
            sources=sources_json,
            snippets=snippets_json,
            cards=cards_json,
        )
        db.add(msg)
        db.commit()
    except Exception as e:
        logger.error(f"[AI_utils] Error saving message: {e}")
    finally:
        db.close()

def load_history_from_db(thread_id: str, limit: int = 10):
    db = SessionLocal()
    messages = []
    try:
        db_msgs = (
            db.query(Message)
            .filter(Message.thread_id == thread_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
            .all()
        )
        for msg in reversed(db_msgs):
            role = str(msg.role)
            content = str(msg.content)
            if role == "user":
                messages.append(HumanMessage(content=content))
            else:
                messages.append(AIMessage(content=content))
    except Exception as e:
        logger.error(f"[AI_utils] Error loading history: {e}")
    finally:
        db.close()
    return messages

def clean_text_for_tts(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    text = re.sub(r"#+\s?", "", text)
    text = re.sub(r"`+", "", text)
    text = re.sub(r"<function=.*?>.*?</function>", "", text, flags=re.DOTALL)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)
    return text.strip()

def clean_response(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    text = re.sub(r"<\|.*?\|>", "", text).strip()
    text = re.sub(r"<function=.*?>.*?</function>", "", text, flags=re.DOTALL).strip()
    text = re.sub(
        r"^(MomAI|Assistant|Assistente)\s* : \s*", "", text, flags=re.IGNORECASE
    ).strip()
    text = "".join(c for c in text if ord(c) <= 0xFFFF)
    return text

def _is_missing_capability(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(re.search(pat, lowered) for pat in _MISSING_CAPABILITY_PATTERNS)

async def _build_missing_capability_card(
    user_text: str,
    assistant_text: str,
    no_tools_available: bool | None,
    had_tool_call: bool,
    current_agent: str = "responder",
) -> dict | None:
    if had_tool_call:
        return {"apply": False}
    if current_agent == "responder":
        return {"apply": False}
    if no_tools_available is False:
        return {"apply": False}
    if not _is_missing_capability(assistant_text):
        return {"apply": False}

    locale = get_locale()
    db = SessionLocal()
    try:
        s = db.query(Settings).first()
        is_lite = s and s.ai_tier == "lite"
    finally:
        db.close()

    if is_lite:
        return {
            "apply": True,
            "content": t("suggest_ultra_card_content", locale=locale),
            "cta": t("suggest_ultra_card_cta", locale=locale),
            "action": ULTRA_MODE_ACTION
        }

    return {
        "apply": True,
        "content": t("missing_capability_card_content", locale=locale),
        "cta": t("missing_capability_card_cta", locale=locale),
        "action": EXTENSIONS_STORE_ACTION
    }

def _open_feature_card(content: str, cta_label: str, action: str):
    from tools.system_actions import show_chat_card
    options = [action]
    options_map = {action: cta_label}
    show_chat_card.invoke(
        {"content": content, "options": options, "options_map": options_map}
    )

def safe_speak(text: str):
    try:
        import services.voice.tts as tts
        tts.speak_sentence(text)
    except RuntimeError as e:
        logger.warning(f"[AI_utils] TTS Speak Thread Error ignored: {e}")
    except Exception as e:
        logger.error(f"[AI_utils] TTS Speak Error: {e}")

async def speak_and_notify(text: str) -> None:
    if not text:
        logger.debug("[Voice] Auto TTS skipped: empty text")
        return

    import app_state
    from database.models import SessionLocal, Settings

    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
    finally:
        db.close()

    ai_tier = (settings.ai_tier if settings else None) or "pro"
    if ai_tier == "lite":
        logger.info("[Voice] Auto TTS blocked: ai_tier=lite")
        return

    if settings and settings.tts_enabled is False:
        logger.info("[Voice] Auto TTS blocked: settings.tts_enabled=false")
        return

    # Ensure voice stack is available for automatic TTS paths.
    try:
        if not app_state.tts:
            logger.debug("[Voice] Auto TTS: loading TTS runtime")
            app_state.ensure_tts_runtime(prewarm=True)
    except Exception as e:
        logger.warning(f"[Voice] Auto TTS blocked: TTS runtime init failed ({e})")

    if not app_state.tts:
        logger.warning("[Voice] Auto TTS blocked: app_state.tts unavailable")
        return

    # Keep TTS manager initialized so auto-speak behaves like manual /chat/speak.
    try:
        if settings and settings.tts_voice:
            app_state.tts.tts.set_voice(settings.tts_voice)
        app_state.tts.tts.initialize()
    except Exception as e:
        logger.warning(f"[Voice] Auto TTS blocked: TTS initialize failed ({e})")
        return

    if app_state.tts.tts.enabled:
        logger.debug(f"[Voice] Speaking: {text[:50]}...")
        safe_speak(text)
        # We don't need to broadcast tts_start here anymore because
        # app_state.py already handles it reactively via on_speech_start
    else:
        logger.info("[Voice] Auto TTS blocked: runtime tts.enabled=false")

async def _broadcast_tts_event(event_type: str) -> None:
    import app_state
    payload = {"type": event_type, "data": {}}
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if (
        app_state.main_loop
        and app_state.main_loop.is_running()
        and app_state.main_loop != current_loop
    ):
        asyncio.run_coroutine_threadsafe(
            app_state.broadcast_to_sockets(payload), app_state.main_loop
        )
        return

    await app_state.broadcast_to_sockets(payload)


def _get_summary_record(thread_id: str):
    from database.models import SessionLocal, ConversationSummary
    db = SessionLocal()
    try:
        return db.query(ConversationSummary).filter(ConversationSummary.thread_id == thread_id).first()
    finally:
        db.close()

def _upsert_summary(thread_id: str, content: str, last_message_id: int):
    from database.models import SessionLocal, ConversationSummary
    db = SessionLocal()
    try:
        record = db.query(ConversationSummary).filter(ConversationSummary.thread_id == thread_id).first()
        if record:
            record.content = content
            record.last_message_id = last_message_id
            record.updated_at = datetime.now()
        else:
            record = ConversationSummary(
                thread_id=thread_id,
                content=content,
                last_message_id=last_message_id,
                updated_at=datetime.now(),
            )
            db.add(record)
        db.commit()
    finally:
        db.close()

def _split_messages_for_summary(messages, recent_budget: int):
    used = 0
    idx = len(messages)
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        msg_tokens = count_message_tokens(msg.role or "", msg.content or "")
        if used + msg_tokens > recent_budget:
            break
        used += msg_tokens
        idx = i
    return messages[:idx], messages[idx:]

async def _summarize_messages(messages, existing_summary: str | None, llm) -> str:
    if not messages or not llm:
        return existing_summary or ""
    summary_header = "RESUMO ATUAL" if existing_summary else "RESUMO ATUAL (vazio)"
    lines = []
    for msg in messages:
        role = msg.role or ""
        content = msg.content or ""
        lines.append(f"{role}: {content}")
    chunk = "\n".join(lines)
    system_prompt = SUMMARY_SYSTEM_PROMPT
    user_prompt = (
        f"{summary_header}:\n{existing_summary or ''}\n\n"
        f"NOVAS MENSAGENS:\n{chunk}\n\n"
        "RESUMO ATUALIZADO:"
    )
    try:
        response = await llm.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
        )
        content = getattr(response, "content", "")
        return content.strip() or (existing_summary or "")
    except Exception as e:
        logger.warning(f"[AI_utils] Summary failed: {e}")
        return existing_summary or ""

async def ensure_summary(thread_id: str, llm) -> str | None:
    from database.models import SessionLocal, Message
    db = SessionLocal()
    try:
        messages = db.query(Message).filter(Message.thread_id == thread_id).order_by(Message.created_at.asc()).limit(200).all()
    finally:
        db.close()
    if not messages:
        return None
    ctx_total = get_context_window()
    budget = int(ctx_total * SUMMARY_BUDGET_PCT)
    recent_budget = max(256, int(budget * SUMMARY_RECENT_PCT))
    old_messages, _ = _split_messages_for_summary(messages, recent_budget)
    if not old_messages:
        record = _get_summary_record(thread_id)
        return record.content if record else None
    summary_record = _get_summary_record(thread_id)
    last_old_id = int(old_messages[-1].id)
    if summary_record and summary_record.last_message_id >= last_old_id:
        return summary_record.content
    if summary_record:
        new_msgs = [m for m in old_messages if m.id > summary_record.last_message_id]
        existing_summary = summary_record.content
    else:
        new_msgs = old_messages
        existing_summary = None
    updated = await _summarize_messages(new_msgs, existing_summary, llm)
    if updated:
        _upsert_summary(thread_id, updated, last_old_id)
        return updated
    return existing_summary
