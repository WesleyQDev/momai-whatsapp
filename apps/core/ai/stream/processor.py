import json
import logging
import os
import threading
import time
import traceback
from typing import Any, AsyncGenerator, Optional
from langchain_core.messages import HumanMessage

from ai.stream.state import StreamState
from ai.stream.handler import StreamHandler
import app_state
from ai import utils
from ai.constants import DEFAULT_RECURSION_LIMIT
from ai.utils import (
    ensure_summary,
    save_message_to_db,
    clean_response,
    _is_missing_capability,
    _build_missing_capability_card,
    speak_and_notify,
    clean_text_for_tts,
)
from database.models import SessionLocal, Settings
import services.voice.tts as tts

logger = logging.getLogger("momai.ai")


class StreamProcessor:
    def __init__(self, message_content: str, thread_id: str, graph: Any, llm: Any, speak_response: bool = True):
        self.state = StreamState(thread_id=thread_id, user_content=message_content)
        self.graph = graph
        self.llm = llm
        self.speak_response = speak_response
        self.handler = StreamHandler(self.state, speak_response=speak_response)

    async def process(self) -> AsyncGenerator[str, None]:
        # 1. Setup
        app_state.last_thread_id = self.state.thread_id
        try:
            tts.stop_all()
        except:
            pass

        if not utils.is_loading and (self.llm is None or self.graph is None):
            import asyncio
            from database.models import SessionLocal, Settings

            # Start initialization
            db = SessionLocal()
            s = db.query(Settings).first()
            tier = s.ai_tier if s else "pro"
            db.close()

            app_state.initialize_llm(tier=tier)
            yield f"data: {json.dumps({'status': 'initializing_llm'})}\n\n"

            # Wait for it to be ready
            await asyncio.to_thread(
                app_state.orchestrator.llm_ready_event.wait, timeout=300
            )

            self.llm = app_state.orchestrator.llm
            self.graph = app_state.orchestrator.momai_graph

        if utils.is_loading or self.llm is None or self.graph is None:
            status_mode = utils.llm_mode if utils.llm_mode != "waiting" else "inicial"
            from utils.i18n import t, get_locale

            msg = t("llm_loading_message", locale=get_locale(), mode=status_mode)
            yield f"data: {json.dumps({'error': msg})}\n\n"
            return

        app_state.set_ai_busy(True)
        utils.clear_cancel_generation()
        threading.current_thread()._momai_thread_id = self.state.thread_id

        self.state.prebuffer_limit = self._get_prebuffer_limit()
        # Check for direct tool execution bypass
        tool_bypass_result = None
        tool_bypass_name = None
        tool_bypass_args = {}
        bypass_content = self.state.user_content.strip()
        
        try:
            # Check JSON payload from Dynamic UI Schema
            if bypass_content.startswith("{") and bypass_content.endswith("}"):
                payload = json.loads(bypass_content)
                action = payload.get("action", "")
                if action == "execute_tool":
                    val = payload.get("value", {})
                    tool_bypass_name = val.get("tool", "")
                    tool_bypass_args = val.get("args", {})
                elif action.startswith("tool:"):
                    tool_bypass_name = action.replace("tool:", "")
                    tool_bypass_args = payload.get("value", {})
                    
            # Check String __TOOL__ prefix from normal options
            elif bypass_content.startswith("__TOOL__:"):
                parts = bypass_content.split(":", 2)
                if len(parts) >= 2:
                    tool_bypass_name = parts[1]
                    if len(parts) > 2 and parts[2].strip():
                        try:
                            tool_bypass_args = json.loads(parts[2])
                        except:
                            tool_bypass_args = {"input": parts[2]}
            
            # Execute if valid
            if tool_bypass_name:
                from tools.system_actions import get_all_tools_registry
                registry = get_all_tools_registry(force_refresh=True)
                if tool_bypass_name in registry:
                    tool_func = registry[tool_bypass_name]
                    import asyncio
                    
                    logger.info(f"[AI_core] Direct Tool Execution Bypass: {tool_bypass_name}({tool_bypass_args})")
                    
                    async def _invoke_tool(func, args):
                        if asyncio.iscoroutinefunction(func.invoke):
                            return await func.ainvoke(args)
                        return await asyncio.to_thread(func.invoke, args)
                    
                    try:
                        res = await _invoke_tool(tool_func, tool_bypass_args)
                        tool_bypass_result = str(res)
                    except Exception as first_err:
                        if "validation error" in str(first_err).lower() or "Field required" in str(first_err):
                            logger.warning(f"[AI_core] Arg mismatch for '{tool_bypass_name}', attempting remap...")
                            
                            # Get the expected field names from the tool schema
                            schema = getattr(tool_func, 'args_schema', None)
                            expected_fields = list(schema.model_fields.keys()) if schema else []
                            provided_values = list(tool_bypass_args.values())
                            
                            remapped = False
                            # Strategy 1: If there's exactly 1 required field and 1 provided value, map directly
                            if len(expected_fields) >= 1 and len(provided_values) >= 1:
                                new_args = {expected_fields[0]: provided_values[0]}
                                try:
                                    res = await _invoke_tool(tool_func, new_args)
                                    tool_bypass_result = str(res)
                                    remapped = True
                                    logger.info(f"[AI_core] Remapped args: {tool_bypass_args} -> {new_args}")
                                except Exception:
                                    pass
                            
                            # Strategy 2: If value looks like a path, try open_in_explorer directly
                            if not remapped and provided_values:
                                val = str(provided_values[0])
                                if ('\\' in val or '/' in val) and registry.get("open_in_explorer"):
                                    try:
                                        res = await _invoke_tool(registry["open_in_explorer"], {"path": val})
                                        tool_bypass_result = str(res)
                                        remapped = True
                                        logger.info(f"[AI_core] Fallback to open_in_explorer with path='{val}'")
                                    except Exception:
                                        pass
                            
                            if not remapped:
                                raise first_err
                        else:
                            raise
                else:
                    logger.warning(f"[AI_core] Direct bypass requested but tool '{tool_bypass_name}' not found.")
        except Exception as e:
            logger.error(f"[AI_core] Direct tool bypass error: {e}")
            import traceback
            traceback.print_exc()

        self.state.summary_text = await ensure_summary(self.state.thread_id, self.llm)
        save_message_to_db(self.state.thread_id, "user", self.state.user_content)

        if tool_bypass_result is not None:
            # Tool executed successfully, bypass the graph entirely
            clean_reply = clean_response(tool_bypass_result)
            yield f"data: {json.dumps({'token': clean_reply})}\n\n"
            
            save_message_to_db(self.state.thread_id, "assistant", clean_reply)
            
            if self.speak_response:
                await speak_and_notify(clean_text_for_tts(clean_reply))
                
            yield f"data: {json.dumps({'done': True})}\n\n"
            app_state.set_ai_busy(False)
            return

        config = {
            "configurable": {"thread_id": self.state.thread_id},
            "recursion_limit": int(
                os.getenv("MOMAI_GRAPH_RECURSION_LIMIT", str(DEFAULT_RECURSION_LIMIT))
            ),
        }
        input_data = {
            "messages": [HumanMessage(content=self.state.user_content)],
            "summary": self.state.summary_text,
            "search_count": 0,
        }
        last_activity_time = time.time()
        
        # 2. Stream execution
        try:
            if self.graph is None:
                logger.error("[AI_core] Graph is None in StreamProcessor!")
                yield f"data: {json.dumps({'error': 'Motor de IA não inicializado corretamente.'})}\n\n"
                return

            logger.debug(f"[AI_core] Starting graph stream for thread {self.state.thread_id}")

            async for event in self.graph.astream_events(
                input_data, config=config, version="v2"
            ):
                if utils.cancel_generation or utils.is_loading:
                    logger.debug("[AI_core] Generation cancelled or stack reloading, breaking stream.")
                    break

                # Send heartbeat if no event for 10s
                current_time = time.time()
                if current_time - last_activity_time > 10:
                    logger.debug("[AI_core] sending thinking heartbeat...")
                    yield f"data: {json.dumps({'status': 'Pensando...'})}\n\n"
                    last_activity_time = current_time

                try:
                    async for chunk in self.handler.handle_event(event):
                        last_activity_time = time.time()
                        yield chunk
                except Exception as handler_err:
                    logger.error(f"[AI_core] Error in event handler: {handler_err}")
                    # Don't crash the whole stream for one event error if possible
                    continue

        except Exception as e:
            logger.exception(f"[AI_core] Fatal error during graph execution: {e}")
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
        except:
            pass
        return limit

    async def _handle_error(self, e: Exception) -> AsyncGenerator[str, None]:
        error_msg = str(e)
        logger.error(f"[AI_core] Stream Error: {error_msg}")
        traceback.print_exc()

        if "429" in error_msg or "rate_limit" in error_msg.lower():
            friendly = "Sir, I have reached the Groq processing limit for this minute. Please wait a few seconds before trying again."
            yield f"data: {json.dumps({'error': friendly})}\n\n"
            await speak_and_notify(
                "Sorry, Sir. I need a short break due to rate limits."
            )
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
                            self.state.activities_trace[i] = (
                                f"Buscando ({self.state.search_count})"
                            )
                            break
        except Exception as e:
            logger.debug(f"[AI_core] Error getting final state: {e}")

        # 2. Yield remaining data
        if self.state.final_snippets:
            yield f"data: {json.dumps({'snippets': self.state.final_snippets})}\n\n"
        if self.state.final_cards:
            yield f"data: {json.dumps({'cards': self.state.final_cards})}\n\n"

        app_state.set_ai_busy(False)

        if (
            not self.state.stream_decided
            and self.state.prebuffer
            and not self.state.stream_suppressed
        ):
            yield f"data: {json.dumps({'token': self.state.prebuffer})}\n\n"
            self.state.tts_buffer += self.state.prebuffer

        # 3. Handle missing capability cards and empty fallbacks
        final_reply = clean_response(self.state.full_content)
        
        # If the reply is still empty after everything, provide a small fallback 
        # to avoid the app looking "stuck" with no response.
        if not final_reply.strip():
            from utils.i18n import t, get_locale
            final_reply = t("no_response_found", locale=get_locale())
            yield f"data: {json.dumps({'token': final_reply})}\n\n"
            self.state.full_content = final_reply

        if final_reply.strip() and self.state.stream_suppressed:
            if self.state.pending_card is None and _is_missing_capability(final_reply):
                self.state.pending_card = await _build_missing_capability_card(
                    self.state.user_content,
                    final_reply,
                    self.state.no_tools_available,
                    self.state.had_tool_call,
                    "responder",
                )
            if self.state.pending_card and self.state.pending_card.get("apply"):
                final_reply = self.state.pending_card["content"]
                utils._open_feature_card(
                    self.state.pending_card["content"],
                    self.state.pending_card["cta"],
                    self.state.pending_card.get(
                        "action", utils.EXTENSIONS_STORE_ACTION
                    ),
                )
                yield f"data: {json.dumps({'token': final_reply})}\n\n"
                self.state.tts_buffer = final_reply

        # 4. Persistence
        if final_reply.strip():
            clean_log_reply = final_reply.split('__MOMAI_ACTIONS__')[0].strip()
            
            # Print each line of the reply with a proper log prefix
            for line in clean_log_reply.split('\n'):
                if line.strip():
                    logger.info(f"MomAI: {line.strip()}")
            logger.info("---------------")
            
            pending_graph = app_state.get_pending_graph_data(self.state.thread_id)
            save_message_to_db(
                self.state.thread_id,
                "assistant",
                final_reply,
                activities=self.state.activities_trace
                if self.state.activities_trace
                else None,
                graph_data=pending_graph,
                sources=self.state.final_sources,
                snippets=self.state.final_snippets,
                cards=self.state.final_cards,
            )

        # 5. Final TTS
        if not utils.cancel_generation and self.speak_response and self.state.tts_buffer.strip():
            clean_phrase = clean_text_for_tts(
                clean_response(self.state.tts_buffer)
            ).strip()
            if len(clean_phrase) > 1:
                await speak_and_notify(clean_phrase)

        yield f"data: {json.dumps({'done': True})}\n\n"
