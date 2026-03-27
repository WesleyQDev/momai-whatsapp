import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, List, Optional
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from ai.stream.state import StreamState
from utils.tokenizer import count_message_tokens
import app_state
from ai.utils import (
    clean_response,
    _build_missing_capability_card,
    speak_and_notify,
    clean_text_for_tts,
)

logger = logging.getLogger("momai.ai")


class StreamHandler:
    def __init__(self, state: StreamState, speak_response: bool = True):
        self.state = state
        self.speak_response = speak_response

    async def handle_event(self, event: Dict[str, Any]) -> AsyncGenerator[str, None]:
        kind = event["event"]
        node_name = event.get("metadata", {}).get("langgraph_node", "")

        if kind == "on_chain_end":
            if node_name == "search_counter":
                async for chunk in self._handle_search_count(event):
                    yield chunk
            elif node_name == "extract_sources":
                async for chunk in self._handle_sources(event):
                    yield chunk
            elif node_name == "router":
                async for chunk in self._handle_router(event):
                    yield chunk
            elif node_name == "momai_agent":
                async for chunk in self._handle_manager(event):
                    yield chunk
            elif node_name == "specialist_worker":
                async for chunk in self._handle_specialist_end(event):
                    yield chunk

        elif kind == "on_chain_start":
            if node_name == "specialist_worker":
                async for chunk in self._handle_specialist(event):
                    yield chunk

        elif kind == "on_tool_start":
            async for chunk in self._handle_tool_start(event):
                yield chunk

        elif kind == "on_chat_model_start":
            self.state.current_turn_buffer = ""

        elif kind == "on_chat_model_stream":
            async for chunk in self._handle_model_stream(event):
                yield chunk

        elif kind == "on_tool_end":
            async for chunk in self._handle_tool_end(event):
                yield chunk

        elif kind == "on_chat_model_end":
            async for chunk in self._handle_model_end(event):
                yield chunk

    async def _handle_search_count(
        self, event: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        output = event["data"].get("output")
        if output and isinstance(output, dict):
            self.state.search_count = output.get("search_count", 0)
            if self.state.search_count > 0 and self.state.activities_trace:
                for i in range(len(self.state.activities_trace) - 1, -1, -1):
                    if self.state.activities_trace[i].startswith("Buscando"):
                        self.state.activities_trace[i] = (
                            f"Buscando ({self.state.search_count})"
                        )
                        yield f"data: {json.dumps({'status': self.state.activities_trace[i]})}\n\n"
                        break

    async def _handle_sources(self, event: Dict[str, Any]) -> AsyncGenerator[str, None]:
        output = event["data"].get("output")
        if output and isinstance(output, dict):
            sources = output.get("sources")
            if sources:
                yield f"data: {json.dumps({'sources': sources})}\n\n"

            snippets = output.get("snippets")
            if snippets:
                yield f"data: {json.dumps({'snippets': snippets})}\n\n"

            cards = output.get("cards")
            if cards:
                yield f"data: {json.dumps({'cards': cards})}\n\n"

    async def _handle_specialist(
        self, event: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        input_data = event.get("data", {}).get("input", {})
        skill_id = None
        if isinstance(input_data, dict):
            skill_id = input_data.get("skill_id")
            if not skill_id:
                msgs = input_data.get("messages", [])
                for msg in reversed(msgs):
                    if hasattr(msg, "tool_calls") and msg.tool_calls:
                        for tc in msg.tool_calls:
                            if tc.get("name") == "activate_skill":
                                skill_id = tc.get("args", {}).get("skill_id")
                                break
                        if skill_id:
                            break
        if skill_id:
            self.state.active_skill_name = skill_id.split('.')[-1]
            status = f"Especialista: Executando {self.state.active_skill_name}..."
            if self.state.add_activity(status):
                yield f"data: {json.dumps({'status': status})}\n\n"
                yield f"data: {json.dumps({'active_skill': self.state.active_skill_name})}\n\n"

    async def _handle_specialist_end(
        self, event: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        """Handle specialist final output when it bypasses the Manager (direct pass-through)."""
        output = event["data"].get("output")
        if not output or not isinstance(output, dict):
            return

        msgs = output.get("messages", [])
        active_skill = output.get("active_skill_id")

        # Only intercept when specialist is done (active_skill_id cleared)
        # and the last message is a ToolMessage (direct answer, not a tool_call)
        if active_skill is not None:
            return

        for msg in reversed(msgs):
            if isinstance(msg, ToolMessage) and msg.content:
                content = clean_response(msg.content)
                if content:
                    # We might want to filter generic SYSTEM: NO_RESULTS but for user UX, 
                    # it's better to show 'something' than a stuck '...' bubble.
                    if not self.state.full_content:
                        self.state.stream_decided = True
                        self.state.had_tool_call = True

                        if not any(a == "Finalizando resposta..." for a in self.state.activities_trace):
                            self.state.add_activity("Finalizando resposta...")
                            yield f"data: {json.dumps({'status': 'Finalizando resposta...'})}\n\n"

                        self.state.full_content = content
                        self.state.tts_buffer += content
                        yield f"data: {json.dumps({'token': content})}\n\n"
                break

    async def _handle_router(self, event: Dict[str, Any]) -> AsyncGenerator[str, None]:
        output = event["data"].get("output")
        if output and isinstance(output, dict):
            mem_notes = output.get("memory_notes")
            if output.get("memory_context") and mem_notes:
                seen_ids = set()
                memory_sources = []
                for note in mem_notes:
                    nid = note.get("note_id", "unknown")
                    if nid not in seen_ids:
                        seen_ids.add(nid)
                        memory_sources.append(
                            {
                                "url": f"momai://note/{nid}",
                                "title": f"Nota: {note.get('title', 'Sem título')}",
                                "snippet": note.get("text", "")[:200],
                            }
                        )
                count = len(memory_sources)
                status = f"Memória: {count} nota{'s' if count != 1 else ''} relevante{'s' if count != 1 else ''}"
                if self.state.add_activity(status):
                    yield f"data: {json.dumps({'status': status})}\n\n"
                if memory_sources:
                    yield f"data: {json.dumps({'sources': memory_sources})}\n\n"

    async def _handle_manager(self, event: Dict[str, Any]) -> AsyncGenerator[str, None]:
        output = event["data"].get("output")
        if output and isinstance(output, dict):
            msgs = output.get("messages", [])
            if msgs and hasattr(msgs[-1], "tool_calls") and msgs[-1].tool_calls:
                tc = msgs[-1].tool_calls[0]
                if tc["name"] == "activate_skill":
                    skill_arg = tc["args"].get("skill_id", "unknown")
                    from utils.i18n import t, get_locale

                    status = t(
                        "status_delegating",
                        locale=get_locale(),
                        skill=skill_arg.split(".")[-1],
                    )
                else:
                    from utils.i18n import t, get_locale

                    status = t(
                        "status_calling_tool", locale=get_locale(), tool=tc["name"]
                    )
            else:
                from utils.i18n import t, get_locale

                status = t("status_finalizing", locale=get_locale())

            if self.state.add_activity(status):
                yield f"data: {json.dumps({'status': status})}\n\n"

    async def _handle_tool_start(
        self, event: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        name = event["name"]
        
        # Track tool locally for rich UI
        input_data = event.get("data", {}).get("input", {})
        query_str = json.dumps(input_data, ensure_ascii=False) if isinstance(input_data, dict) else str(input_data)
        
        self.state.tool_steps.append({
            "name": name,
            "status": "running",
            "query": query_str,
            "result": None,
            "segment": self.state.current_tool_segment
        })
        yield f"data: {json.dumps({'tool_steps': self.state.tool_steps})}\n\n"

        # Flush prebuffer as intro text BEFORE inserting the marker
        if not self.state.stream_decided and self.state.prebuffer:
            self.state.stream_decided = True
            yield f"data: {json.dumps({'token': self.state.prebuffer})}\n\n"
            self.state.full_content += self.state.prebuffer
            self.state.tts_buffer += self.state.prebuffer
            self.state.prebuffer = ""

        # Insert __MOMAI_ACTIONS__ marker at the right position
        is_first_tool = not self.state.had_tool_call
        self.state.had_tool_call = True

        if is_first_tool:
            # First tool call ever: insert the first marker
            marker = "\n\n__MOMAI_ACTIONS__\n\n"
            self.state.full_content += marker
            yield f"data: {json.dumps({'token': marker})}\n\n"
        elif self.state.text_produced_since_last_tool:
            # Already had tools, but AI spoke since then → start a NEW segment
            self.state.current_tool_segment += 1
            self.state.text_produced_since_last_tool = False
            
            # Update the recently added step to the NEW segment
            if self.state.tool_steps:
                self.state.tool_steps[-1]["segment"] = self.state.current_tool_segment

            marker = "\n\n__MOMAI_ACTIONS__\n\n"
            self.state.full_content += marker
            yield f"data: {json.dumps({'token': marker})}\n\n"

        if name in ["duckduckgo_search", "duckduckgo_news"]:
            if not any("Buscando" in a for a in self.state.activities_trace):
                status = "Buscando..."
                if self.state.add_activity(status):
                    yield f"data: {json.dumps({'status': status})}\n\n"
        else:
            status = f"Usando: {name}"
            if self.state.add_activity(status):
                yield f"data: {json.dumps({'status': status})}\n\n"

    async def _handle_tool_end(self, event: Dict[str, Any]) -> AsyncGenerator[str, None]:
        name = event["name"]
        output = event.get("data", {}).get("output", "")
        
        # Determine string representation of output
        out_str = str(output) if not isinstance(output, str) else output
        
        # Update the last matching tool step to done 
        for step in reversed(self.state.tool_steps):
            if step["name"] == name and step["status"] == "running":
                step["status"] = "done"
                step["result"] = out_str
                break
                
        yield f"data: {json.dumps({'tool_steps': self.state.tool_steps})}\n\n"

    async def _handle_model_stream(
        self, event: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        node = event.get("metadata", {}).get("langgraph_node", "")
        if node == "router":
            return

        chunk = event["data"]["chunk"]
        if hasattr(chunk, "tool_call_chunks") and chunk.tool_call_chunks:
            self.state.current_turn_buffer = ""
            # DO NOT clear prebuffer here — it contains intro text
            # that will be properly flushed in _handle_tool_start
            return

        content = chunk.content
        if not content:
            return

        filtered_content = "".join(c for c in content if ord(c) <= 0xFFFF)
        if not filtered_content:
            return

        # Show \"Finalizando resposta...\" ONLY after a tool has been called
        if self.state.had_tool_call and not any(a == "Finalizando resposta..." for a in self.state.activities_trace):
            status = "Finalizando resposta..."
            self.state.add_activity(status)
            yield f"data: {json.dumps({'status': status})}\n\n"

        if not self.state.full_content:
            if self.state.had_tool_call:
                self.state.stream_decided = True
                yield f"data: {json.dumps({'token': filtered_content})}\n\n"
                self.state.full_content += filtered_content
                self.state.tts_buffer += filtered_content
            else:
                self.state.prebuffer += filtered_content
                if len(self.state.prebuffer) >= self.state.prebuffer_limit:
                    decision = await self._check_missing_capability()
                    if decision and decision.get("apply"):
                        self.state.stream_decided = True
                        self.state.stream_suppressed = True
                        self.state.pending_card = decision
                    else:
                        self.state.stream_decided = True
                        yield f"data: {json.dumps({'token': self.state.prebuffer})}\n\n"
                        self.state.full_content += self.state.prebuffer
                        self.state.tts_buffer += self.state.prebuffer
                        self.state.prebuffer = ""
        elif not self.state.stream_suppressed:
            if self.state.had_tool_call:
                self.state.text_produced_since_last_tool = True
                
            yield f"data: {json.dumps({'token': filtered_content})}\n\n"
            self.state.full_content += filtered_content
            self.state.tts_buffer += filtered_content

        await self._process_tts()

    async def _handle_model_end(
        self, event: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        if self.state.current_turn_buffer:
            tokens = self.state.current_turn_buffer
            self.state.current_turn_buffer = ""

            if self.state.had_tool_call and not any(
                a == "Finalizando resposta..." for a in self.state.activities_trace
            ):
                self.state.add_activity("Finalizando resposta...")
                yield f"data: {json.dumps({'status': 'Finalizando resposta...'})}\n\n"

            yield f"data: {json.dumps({'token': tokens})}\n\n"
            self.state.full_content += tokens
            self.state.tts_buffer += tokens

        node = event.get("metadata", {}).get("langgraph_node", "")
        if node in ["momai_agent", "responder"]:
            output = event["data"].get("output")
            if output and hasattr(output, "content") and output.content:
                if not self.state.full_content:
                    content = clean_response(output.content)
                    if (
                        content
                        and '{"next":' not in content
                        and "show_graph(" not in content
                    ):
                        self.state.full_content = content
                        yield f"data: {json.dumps({'token': content})}\n\n"
                        self.state.tts_buffer += content

    async def _check_missing_capability(self) -> Optional[Dict[str, Any]]:
        return await _build_missing_capability_card(
            self.state.user_content,
            self.state.prebuffer,
            self.state.no_tools_available,
            self.state.had_tool_call,
            "responder",
        )

    async def _process_tts(self) -> None:
        from ai import utils
        while True:
            if utils.cancel_generation:
                break
            # Fast Trigger for first response chunk
            if not self.state.full_content and len(self.state.tts_buffer) > 8:
                fast_match = re.search(r"(.*?[,!?])\s+", self.state.tts_buffer)
                if fast_match:
                    chunk = fast_match.group(1).strip()
                    self.state.tts_buffer = self.state.tts_buffer[fast_match.end() :]
                    if self.speak_response:
                        await speak_and_notify(clean_text_for_tts(chunk))
                    continue

            # Paragraph break
            para_match = self.state.paragraph_pattern.search(self.state.tts_buffer)
            if para_match:
                chunk = para_match.group(1).strip()
                self.state.tts_buffer = self.state.tts_buffer[para_match.end() :]
                if len(chunk) > 1:
                    if self.speak_response:
                        await speak_and_notify(clean_text_for_tts(chunk))
                continue

            # Fallback for long buffer
            if len(self.state.tts_buffer) > 120:
                sent_match = self.state.sentence_end_pattern.search(
                    self.state.tts_buffer
                )
                if sent_match:
                    chunk = sent_match.group(1).strip()
                    self.state.tts_buffer = self.state.tts_buffer[sent_match.end() :]
                    if len(chunk) > 1:
                        if self.speak_response:
                            await speak_and_notify(clean_text_for_tts(chunk))
                    continue

                if len(self.state.tts_buffer) > 200:
                    last_space = self.state.tts_buffer.rfind(" ")
                    if last_space > 50:
                        chunk = self.state.tts_buffer[:last_space].strip()
                        self.state.tts_buffer = self.state.tts_buffer[
                            last_space:
                        ].strip()
                        if self.speak_response:
                            await speak_and_notify(clean_text_for_tts(chunk))
                    else:
                        break
                else:
                    break
            else:
                break
