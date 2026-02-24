import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import app_state
from api.deps import get_db, require_ai_loaded
from api.schemas import ChatMessage

router = APIRouter()


@router.post("/chat/stream")
@require_ai_loaded
async def handle_chat_stream(message: ChatMessage):
    return StreamingResponse(app_state.generate(message), media_type="text/event-stream")


@router.post("/chat/stop")
async def stop_chat_generation():
    try:
        import ai.orchestrator as orchestrator
        orchestrator.request_cancel_generation()
    except Exception:
        # Orchestrator might not be loaded yet
        pass

    try:
        import services.voice.tts as tts
        tts.stop_all()
    except Exception:
        # TTS might not be loaded yet
        pass

    if app_state.main_loop:
        await app_state.broadcast_to_sockets({"type": "tts_stop", "data": {}})

    return {"status": "ok"}


@router.post("/chat/stop-voice")
async def stop_chat_voice():
    try:
        import services.voice.tts as tts
        tts.stop_all()
    except Exception:
        # TTS might not be loaded yet
        pass

    if app_state.main_loop:
        await app_state.broadcast_to_sockets({"type": "tts_stop", "data": {}})

    return {"status": "ok"}


@router.post("/chat/speak")
async def speak_text(data: dict):
    text = data.get("text")
    if not text:
        return {"status": "error", "message": "No text provided"}
    
    try:
        import services.voice.tts as tts
        tts.speak_sentence(text)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def _prune_sessions(db: Session):
    from database.models import Message
    from sqlalchemy import func
    from ai.orchestrator import clear_history_db

    threads_query = (
        db.query(Message.thread_id)
        .group_by(Message.thread_id)
        .order_by(func.max(Message.created_at).desc())
        .all()
    )

    if len(threads_query) > 5:
        for t in threads_query[5:]:
            await clear_history_db(t[0])

@router.get("/chat/history")
async def get_chat_history(thread_id: str = "default", db: Session = Depends(get_db)):
    from database.models import Message
    
    await _prune_sessions(db)

    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
        .limit(100)
        .all()
    )

    result = []
    for msg in messages:
        msg_dict = {"role": msg.role, "content": msg.content}
        if msg.activities:
            try:
                msg_dict["activities"] = json.loads(msg.activities)
            except Exception as e:
                app_state.logger.debug(f"[API] Error decoding activities JSON: {e}")
        if msg.graph_data:
            try:
                msg_dict["graphData"] = json.loads(msg.graph_data)
            except Exception as e:
                app_state.logger.debug(f"[API] Error decoding graph data JSON: {e}")
        result.append(msg_dict)

    return result


@router.delete("/chat/history")
async def delete_chat_history(thread_id: str = "default"):
    from ai.orchestrator import clear_history_db

    try:
        import ai.orchestrator as orchestrator
        orchestrator.request_cancel_generation()
    except Exception:
        # Orchestrator might not be loaded yet
        pass

    try:
        import services.voice.tts as tts
        tts.stop_all()
    except Exception:
        # TTS might not be loaded yet
        pass

    if app_state.main_loop:
        await app_state.broadcast_to_sockets({"type": "tts_stop", "data": {}})

    await clear_history_db(thread_id)
    return {"status": "ok"}


@router.delete("/chat/message/{message_id}")
async def delete_single_message(message_id: int, db: Session = Depends(get_db)):
    from database.models import Message

    db.query(Message).filter(Message.id == message_id).delete()
    db.commit()
    return {"status": "ok"}


@router.get("/chat/sessions")
async def get_chat_sessions(db: Session = Depends(get_db)):
    from database.models import Message, SessionTitle
    from sqlalchemy import func
    from ai.orchestrator import clear_history_db
    
    await _prune_sessions(db)
    
    threads_query = (
        db.query(Message.thread_id, func.max(Message.created_at).label("last_activity"), func.count(Message.id).label("message_count"))
        .group_by(Message.thread_id)
        .order_by(func.max(Message.created_at).desc())
        .all()
    )

    result = []
    for t_id, last_act, count in threads_query:
        if count == 0:
            continue
        title_record = (
            db.query(SessionTitle.title)
            .filter(SessionTitle.thread_id == t_id)
            .first()
        )
        first_user_msg = None
        if not title_record:
            first_user_msg = (
                db.query(Message.content)
                .filter(Message.thread_id == t_id, Message.role == "user")
                .order_by(Message.created_at.asc())
                .first()
            )
        result.append({
            "id": t_id,
            "lastActivity": last_act.isoformat() if last_act else None,
            "messageCount": count,
            "title": title_record[0] if title_record else None,
            "firstMessage": first_user_msg[0] if first_user_msg else None
        })
    return {"sessions": result[:5]}


@router.post("/chat/title")
async def generate_session_title(data: dict, db: Session = Depends(get_db)):
    from database.models import SessionTitle
    from ai import orchestrator

    thread_id = data.get("thread_id")
    user_message = data.get("user_message", "")
    assistant_message = data.get("assistant_message", "")

    if not thread_id or not user_message:
        return {"status": "error", "message": "Missing thread_id or user_message"}

    existing = db.query(SessionTitle).filter(SessionTitle.thread_id == thread_id).first()
    if existing:
        return {"status": "ok", "title": existing.title}

    if orchestrator.llm is None:
        fallback = user_message.strip()[:12].strip()
        return {"status": "ok", "title": fallback}

    try:
        from langchain_core.messages import SystemMessage, HumanMessage

        # Combine messages for better context if assistant reply is available
        context = f"User: {user_message}"
        if assistant_message:
            context += f"\nAssistant: {assistant_message}"

        response = await orchestrator.llm.ainvoke([
            SystemMessage(content=(
"Create a short title for this conversation using exactly 1 or 2 words. "
                "STRICT MAXIMUM 6 CHARACTERS. NO PUNCTUATION. NO QUOTES. "
                "The title must be in the same language as the conversation."
            )),
            HumanMessage(content=context),
        ])
        title = getattr(response, "content", "").strip().strip('"\'!?.').replace(".", "")
        
        if not title:
            title = user_message.strip()
    except Exception:
        title = user_message.strip()

    record = SessionTitle(thread_id=thread_id, title=title)
    db.merge(record)
    db.commit()

    return {"status": "ok", "title": title}
