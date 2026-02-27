import json
import logging
import os
import threading
import traceback
from typing import Any, AsyncGenerator, Optional
from langchain_core.messages import HumanMessage

from ai.stream.state import StreamState
from ai.stream.handler import StreamHandler
import app_state
from ai import utils
from ai.utils import (
    ensure_summary, save_message_to_db, clean_response, 
    _is_missing_capability, _build_missing_capability_card, 
    speak_and_notify, clean_text_for_tts
)
from database.models import SessionLocal, Settings
import services.voice.tts as tts

logger = logging.getLogger("momai.ai")

class StreamProcessor:
    def __init__(self, message_content: str, thread_id: str, graph: Any, llm: Any):
        self.state = StreamState(thread_id=thread_id, user_content=message_content)
        self.graph = graph
        self.llm = llm
        self.handler = StreamHandler(self.state)

    async def process(self) -> AsyncGenerator[str, None]:
        # 1. Setup
        app_state.last_thread_id = self.state.thread_id
        try:
            tts.stop_all()
        except: pass

        if utils.is_loading or self.llm is None or self.graph is None:
            status_mode = utils.llm_mode if utils.llm_mode != "waiting" else "inicial"
            msg = f"Aguarde um momento, Senhor. Estou configurando meu motor para o modo {status_mode}."
            yield f"data: {json.dumps({'error': msg})}\n\n"
            return

        app_state.set_ai_busy(True)
        utils.clear_cancel_generation()
        threading.current_thread()._momai_thread_id = self.state.thread_id

        self.state.prebuffer_limit = self._get_prebuffer_limit()
        self.state.summary_text = await ensure_summary(self.state.thread_id, self.llm)
        
        save_message_to_db(self.state.thread_id, "user", self.state.user_content)

        config = {
            "configurable": {"thread_id": self.state.thread_id},
            "recursion_limit": 100,
        }
        input_data = {
            "messages": [HumanMessage(content=self.state.user_content)],
            "summary": self.state.summary_text,
            "search_count": 0,
        }

        # 2. Stream execution
        try:
            async for event in self.graph.astream_events(input_data, config=config, version="v2"):
                if utils.cancel_generation or utils.is_loading: break
                
                async for chunk in self.handler.handle_event(event):
                    yield chunk

        except Exception as e:
            async for chunk in self._handle_error(e):
                yield chunk

        finally:
            async for chunk in self._finalize():
                yield chunk

    def _get_prebuffer_limit(self) -> int:
        limit = int(os.getenv("MOMAI_PREBUFFER_CHARS", "0"))
        try:
            db = SessionLocal()
            settings = db.query(Settings).first()
            if settings and settings.prebuffer_chars is not None:
                limit = int(settings.prebuffer_chars)
            db.close()
        except: pass
        return limit

    async def _handle_error(self, e: Exception) -> AsyncGenerator[str, None]:
        error_msg = str(e)
        logger.error(f"[AI_core] Stream Error: {error_msg}")
        traceback.print_exc()

        if "429" in error_msg or "rate_limit" in error_msg.lower():
            friendly = "Sir, I have reached the Groq processing limit for this minute. Please wait a few seconds before trying again."
            yield f"data: {json.dumps({'error': friendly})}\n\n"
            await speak_and_notify("Sorry, Sir. I need a short break due to rate limits.")
        else:
            yield f"data: {json.dumps({'error': error_msg})}\n\n"

    async def _finalize(self) -> AsyncGenerator[str, None]:
        utils.clear_cancel_generation()
        
        # 1. Sync final state
        try:
            config = {"configurable": {"thread_id": self.state.thread_id}}
            final_state = await self.graph.aget_state(config)
            if final_state and final_state.values:
                self.state.search_count = final_state.values.get("search_count", 0)
                self.state.final_sources = final_state.values.get("sources")
                self.state.final_snippets = final_state.values.get("snippets")
                self.state.final_cards = final_state.values.get("cards")
                
                if self.state.search_count > 0 and self.state.activities_trace:
                    for i in range(len(self.state.activities_trace) - 1, -1, -1):
                        if self.state.activities_trace[i].startswith("Buscando"):
                            self.state.activities_trace[i] = f"Buscando ({self.state.search_count})"
                            break
        except Exception as e:
            logger.debug(f"[AI_core] Error getting final state: {e}")

        # 2. Yield remaining data
        if self.state.final_snippets:
            yield f"data: {json.dumps({'snippets': self.state.final_snippets})}\n\n"
        if self.state.final_cards:
            yield f"data: {json.dumps({'cards': self.state.final_cards})}\n\n"
        
        app_state.set_ai_busy(False)
        
        if not self.state.stream_decided and self.state.prebuffer and not self.state.stream_suppressed:
            yield f"data: {json.dumps({'token': self.state.prebuffer})}\n\n"
            self.state.tts_buffer += self.state.prebuffer

        # 3. Handle missing capability cards
        final_reply = clean_response(self.state.full_content)
        if final_reply.strip() and self.state.stream_suppressed:
            if self.state.pending_card is None and _is_missing_capability(final_reply):
                self.state.pending_card = await _build_missing_capability_card(
                    self.state.user_content, final_reply, self.state.no_tools_available,
                    self.state.had_tool_call, "responder"
                )
            if self.state.pending_card and self.state.pending_card.get("apply"):
                final_reply = self.state.pending_card["content"]
                utils._open_feature_card(self.state.pending_card["content"], self.state.pending_card["cta"], self.state.pending_card.get("action", utils.EXTENSIONS_STORE_ACTION))
                yield f"data: {json.dumps({'token': final_reply})}\n\n"
                self.state.tts_buffer = final_reply

        # 4. Persistence
        if final_reply.strip():
            pending_graph = app_state.get_pending_graph_data(self.state.thread_id)
            save_message_to_db(
                self.state.thread_id, "assistant", final_reply,
                activities=self.state.activities_trace if self.state.activities_trace else None,
                graph_data=pending_graph,
                sources=self.state.final_sources,
                snippets=self.state.final_snippets,
                cards=self.state.final_cards,
            )

        # 5. Final TTS
        if self.state.tts_buffer.strip():
            clean_phrase = clean_text_for_tts(clean_response(self.state.tts_buffer)).strip()
            if len(clean_phrase) > 1:
                await speak_and_notify(clean_phrase)

        yield f"data: {json.dumps({'done': True})}\n\n"
