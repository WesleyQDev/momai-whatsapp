import os
import json
import re
import asyncio
import ast
import uuid
import logging
from datetime import datetime
from typing import Annotated, Sequence, TypedDict, Literal

from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
    SystemMessage,
)
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langgraph.graph.message import add_messages
from langgraph.graph import END, StateGraph



from database.vector_db import vector_db
from services.extensions.manager import extension_manager
from services.memory.external_memory import search_memory, DEFAULT_MAX_TOKENS
from ai.constants import (
    get_language_instruction,
    PERSONA_INJECTION_TEMPLATE,
    HISTORY_BUDGET_PERCENT,
    MIN_CONTEXT_TOKENS,
    SKILL_SIMILARITY_THRESHOLD,
    DEFAULT_TOOL_LIMIT,
    SKILL_SEARCH_LIMIT,
    MAX_HISTORY_MESSAGES,
    MAX_SNIPPET_LENGTH,
    CONFIDENCE_PERCENT_SCALE,
    MIN_QUERY_LENGTH,
    PREVIEW_TOOL_LIMIT,
)
from ai.tool_selector import select_tool_names_for_query
from tools.system_actions import get_all_tools_registry
from utils.tokenizer import count_tokens, count_message_tokens, get_context_window
from utils.safe_tools import extract_extras

from ai.graph.prompts import (
    MEMORY_CONTEXT_HEADER,
    MANAGER_ULTRA_PROMPT,
    MANAGER_PRO_PROMPT,
    MANAGER_LITE_PROMPT,
    SPECIALIST_INSTRUCTIONS_TEMPLATE,
    PREVIOUS_RESULTS_TEMPLATE,
    ERROR_NO_SKILL_CONTEXT,
    ERROR_NO_SKILL_REQUESTED,
    ERROR_SKILL_NOT_FOUND,
    SYSTEM_TOOL_LIMIT_REACHED,
)

logger = logging.getLogger("momai.graph")

def print_execution_panel(
    title: str, valid_history: list, response_content: str, color: str, 
    skills=None, notes=None, tools=None, available_tools=None, task=None, tool_results=None
):
    RESET = "\033[0m"
    CYAN = "\033[36m"
    MAGENTA = "\033[35m"

    logger.info("")
    
    if skills:
        skill_names = [f"'{s['id']}'" for s in skills]
        logger.info(f"{RESET}{CYAN}[Skills]{RESET} {', '.join(skill_names)}")
    if notes:
        notes_titles = [n.get('title', 'Nota') for n in notes]
        logger.info(f"{RESET}{CYAN}[Conhecimento]{RESET} {', '.join(notes_titles)}")
    if tools:
        usage_str = ", ".join([f"{k}: {v}" for k, v in tools.items()])
        logger.info(f"{RESET}{CYAN}[Tools Status]{RESET} {usage_str}")
    if available_tools:
        tools_str = ", ".join([t.name for t in available_tools])
        logger.info(f"{RESET}{CYAN}[Tools Disp]{RESET} {tools_str}")

    if task:
        task_trunc = str(task).replace('\n', ' ')[:90] + ("..." if len(str(task))>90 else "")
        logger.info(f"{RESET}{CYAN}[TASK]{RESET} {task_trunc}")
    if tool_results:
        logger.info(f"{RESET}{CYAN}[RESULTS]{RESET} Recebidos resultados de {len(tool_results)} ferramentas.")

    for msg in valid_history:
        role = getattr(msg, "type", "unknown").upper()
        content_str = str(msg.content).replace('\n', ' ')
        if len(content_str) > 100:
            content_str = content_str[:97] + "..."
            
        tool_str = ""
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            tool_str = f" {MAGENTA}[Call: {msg.tool_calls[0].get('name')}]{RESET}"
        
        logger.info(f"{RESET}{CYAN}[{role}]{RESET} {content_str}{tool_str}")

    content_str = str(response_content).replace('\n', ' ')
    if len(content_str) > 200:
        content_str = content_str[:197] + "..."
    
    logger.info(f"{RESET}{CYAN}[{title.upper()}]{RESET} {content_str}")



@tool
def activate_skill(skill_id: str, task_description: str):
    """Delegates a task to a specialist worker."""
    return f"Delegating to {skill_id}..."


def log_event(title: str, content: str, color: str = ""):
    """Log via standard logging to ensure visibility in Electron terminal."""
    logger.info(f">>> [{title}] {content}")


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    summary: str | None
    memory_context: str | None
    discovered_skills: list[dict] | None
    active_skill_id: str | None
    skill_result: str | None
    fast_path: bool | None
    tool_usage: dict[str, int] | None
    tool_results: list[str] | None
    skill_id: str | None
    task: str | None
    next_step: str | None
    tool_call_id: str | None
    sources: list[dict] | None
    memory_notes: list[dict] | None
    search_count: int | None


def _compute_history_budget(
    system_prompt: str, summary: str | None, budget_pct: float = HISTORY_BUDGET_PERCENT
) -> int:
    ctx_total = get_context_window()
    reserve = int(ctx_total * (1 - budget_pct))
    overhead = count_tokens(system_prompt or "")
    if summary:
        overhead += count_tokens(summary)
    return max(MIN_CONTEXT_TOKENS, ctx_total - reserve - overhead)


def get_valid_history(
    messages: Sequence[BaseMessage], max_messages: int, budget: int
) -> list[BaseMessage]:
    if not messages:
        return []
    # Remove empty messages or messages that might break the sequence
    clean = []
    for m in messages:
        if (m.content and str(m.content).strip()) or (
            hasattr(m, "tool_calls") and m.tool_calls
        ):
            clean.append(m)

    selected = []
    used = 0
    for m in reversed(clean):
        if len(selected) >= max_messages:
            break
        tokens = count_message_tokens(
            getattr(m, "type", ""), str(m.content) if m.content else ""
        )
        if used + tokens > budget:
            break
        selected.append(m)
        used += tokens

    res = list(reversed(selected))

    # Protocol fix: Ensure history doesn't start with a ToolMessage or have consecutive Assistant messages
    while res and isinstance(res[0], ToolMessage):
        res.pop(0)

    # Ensure no consecutive assistant messages at the end
    final_clean = []
    for i, m in enumerate(res):
        if i > 0 and m.type == "assistant" and final_clean[-1].type == "assistant":
            continue  # Skip consecutive assistant messages
        final_clean.append(m)

    return final_clean


def create_momai_graph(
    llm, user_name="Sir", assistant_persona=None, checkpointer=None, tier="pro"
):
    async def discovery_router(state: AgentState):
        try:
            if not state.get("messages"):
                return {"next": "momai_agent", "fast_path": True}
            last_msg = str(state["messages"][-1].content)
            logger.debug(f"[Discovery] Query: {last_msg}")

            greetings = r"^(oi|ol[aá]|tudo bem|como vai|como você está|como voce esta|bom dia|boa tarde|boa noite|opa|e ai|eae|salve|oba|co[eé]|ei|hey|hello|hi)(\?|\!|\s|$)"
            is_greeting = re.search(greetings, last_msg.strip().lower())
            is_short = len(last_msg.strip()) < MIN_QUERY_LENGTH
            # Skip discovery for math expressions to avoid context distraction (e.g., 20/5 being seen as a date)
            is_math = re.match(r"^[\d\s.,/*+\-()^?]+$", last_msg.strip())

            if is_greeting or is_short or is_math:
                return {
                    "fast_path": True,
                    "discovered_skills": [],
                    "next": "momai_agent",
                }

            # 1. Skill Discovery (Hierarchical Priority)
            best_confidence = 0
            best_skill_id = None
            shortcut_msg = None
            skill_hits = []
            if tier == "ultra":
                skill_hits = await vector_db.search_skills(
                    last_msg, limit=SKILL_SEARCH_LIMIT
                )

            # Determine Skill Confidence
            top_skill_dist = min([h.get("_distance", 1.0) for h in skill_hits]) if skill_hits else 1.0
            # High confidence means we likely have a clear action command
            is_action_high_conf = top_skill_dist < 0.25

            # 2. Memory Discovery (Fallback or Contextual)
            memory_hits = []
            # Optimization: Skip memory search if we are very confident about a specific skill
            # unless the query seems to explicitly mention notes (no regex, just semantic fallback)
            if tier != "lite":
                    logger.debug(f"[Discovery] Searching memory for: {last_msg}")
                    memory_hits = await search_memory(last_msg)

            mem_context = ""
            if memory_hits:
                lines = []
                used_tokens = 0
                for hit in memory_hits:
                    title = hit.get("title") or "Nota"
                    text_value = hit.get("text") or ""
                    snippet = text_value.strip()
                    if not snippet:
                        continue
                    entry = f"--- [TÍTULO DA NOTA: {title.upper()}] ---\n{snippet}\n"
                    entry_tokens = count_tokens(entry)
                    if used_tokens + entry_tokens > DEFAULT_MAX_TOKENS:
                        break
                    lines.append(entry)
                    used_tokens += entry_tokens

                if lines:
                    mem_context = MEMORY_CONTEXT_HEADER + "\n".join(lines)

            skills_brief = []
            seen_ids = set()
            if skill_hits:
                for hit in skill_hits:
                    skill_id = hit.get("id", "")
                    if not skill_id or skill_id in seen_ids or "responder" in skill_id:
                        continue

                    dist = hit.get("_distance", 1.0)
                    if (
                        dist < SKILL_SIMILARITY_THRESHOLD
                    ):  # Less strict threshold for cosine distance
                        seen_ids.add(skill_id)
                        skills_brief.append(
                            {
                                "id": skill_id,
                                "name": hit["name"],
                                "description": hit["description"],
                            }
                        )
                        # Convert distance to confidence (0.0 distance = 100%, 1.0+ distance = 0%)
                        confidence = max(
                            0,
                            min(
                                CONFIDENCE_PERCENT_SCALE,
                                (1 - dist) * CONFIDENCE_PERCENT_SCALE,
                            ),
                        )
                        
                        if confidence > best_confidence:
                            best_confidence = confidence
                            best_skill_id = skill_id

                        logger.debug(
                            f"[Discovery] Found Potential Skill: {skill_id} (conf: {confidence:.1f}%)",
                        )
            
            # --- HIGH CONFIDENCE SHORTCUT ---
            # If we have a very high confidence and only one clear skill candidate, 
            # we skip the Manager LLM step and go straight to the Specialist.
            if best_confidence > 85.0 and len(skills_brief) == 1:
                logger.info(f">>> [Discovery] High-confidence match: {best_skill_id}")
                shortcut_msg = AIMessage(
                    content="",
                    tool_calls=[{
                        "id": f"shortcut_{uuid.uuid4().hex[:8]}",
                        "name": "activate_skill",
                        "args": {
                            "skill_id": best_skill_id,
                            "task_description": last_msg
                        }
                    }]
                )

            if mem_context:
                logger.debug(
                    f"[Discovery] Memory Context loaded ({count_tokens(mem_context)} tokens)",
                )

            return {
                "discovered_skills": skills_brief,
                "memory_context": mem_context,
                "memory_notes": memory_hits if memory_hits else None,
                "fast_path": False,
                "tool_usage": {},
                "messages": [shortcut_msg] if shortcut_msg else []
            }
        except Exception as e:
            logger.error(f"Error in discovery_router: {str(e)}")
            return {
                "discovered_skills": [],
                "memory_context": "",
                "fast_path": True,
                "next": "momai_agent",
            }

    async def manager_node(state: AgentState):
        try:
            logger.debug("[Manager] Orchestrating response...")
            lang = get_language_instruction()
            persona = PERSONA_INJECTION_TEMPLATE.format(
                user_name=user_name, assistant_persona=assistant_persona or ""
            )

            now = datetime.now()
            current_time_info = f"Current Date: {now.strftime('%B %d, %Y')}\nCurrent Time: {now.strftime('%H:%M')}"

            skills = state.get("discovered_skills") or []
            skills_text = "\n".join(
                f"- ID: '{s['id']}' | Competency: {s['description']}" for s in skills
            )

            tier_prompts = {
                "ultra": MANAGER_ULTRA_PROMPT.format(
                    skills=skills_text or "No skills discovered."
                ),
                "pro": MANAGER_PRO_PROMPT,
                "lite": MANAGER_LITE_PROMPT,
            }

            system_prompt = (
                f"{lang}\n\n{persona}\n\n"
                f"# CONTEXT\n{current_time_info}\n\n"
                f"{tier_prompts.get(tier, tier_prompts['lite'])}"
            )

            mem_context = state.get("memory_context")
            if mem_context:
                system_prompt += f"\n{mem_context}\n"

            manager_tools = []
            if tier == "ultra":
                manager_tools.append(activate_skill)

                all_reg = get_all_tools_registry()
                for t_name in ["show_interface", "close_interface"]:
                    if all_reg.get(t_name):
                        manager_tools.append(all_reg[t_name])

            tool_usage = state.get("tool_usage", {}) or {}

            available_manager_tools = []
            for t in manager_tools:
                t_metadata = (
                    getattr(t, "tool_metadata", getattr(t, "metadata", {})) or {}
                )
                limit = t_metadata.get("max_calls", DEFAULT_TOOL_LIMIT)
                if tool_usage.get(t.name, 0) < limit:
                    available_manager_tools.append(t)
                else:
                    log_event(
                        "Guardrail",
                        f"Manager Tool '{t.name}' reached its limit ({limit}). Hiding.",
                    )

            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    MessagesPlaceholder(variable_name="messages"),
                ]
            )
            chain = (
                prompt | llm.bind_tools(available_manager_tools)
                if available_manager_tools
                else prompt | llm
            )
            budget = _compute_history_budget(system_prompt, state.get("summary"))
            full_msg = None
            valid_history = get_valid_history(
                state["messages"], MAX_HISTORY_MESSAGES, budget
            )
            
            import time
            start_time = time.time()
            async for chunk in chain.astream({"messages": valid_history}):
                if full_msg is None:
                    full_msg = chunk
                else:
                    full_msg += chunk
            
            end_time = time.time()
            result = full_msg
            elapsed = end_time - start_time
            
            tokens = count_tokens(str(result.content))
            tps = tokens / elapsed if elapsed > 0 else 0.0
            
            print_execution_panel(
                title="MANAGER",
                valid_history=valid_history,
                response_content=str(result.content),
                color="cyan",
                skills=state.get("discovered_skills"),
                notes=state.get("memory_notes"),
                tools=state.get("tool_usage")
            )

            return {"messages": [result]}
        except Exception as e:
            logger.error(f"Error in manager_node: {str(e)}")
            return {
                "messages": [
                    AIMessage(
                        content="Desculpe, encontrei um erro ao processar sua solicitação no momento."
                    )
                ]
            }
    async def specialist_node(state: AgentState):
        """
        Specialist Worker - returns tool_calls for the graph to execute.
        This ensures tool events are emitted for real-time UI updates.
        """
        try:
            logger.debug("[Specialist] Starting specialist worker...")
            last_msg = state["messages"][-1]

            # In LangGraph, if we were redirected back to here from tool results, 
            # last_msg might be a ToolMessage. We should look back at the original AI tool_call.
            if isinstance(last_msg, ToolMessage):
                # Use the state cache for active_skill_id
                skill_id = state.get("active_skill_id")
                # Look for the last HumanMessage to extract the task context
                task_msg = next((m for m in reversed(state["messages"][:-1]) if isinstance(m, HumanMessage)), None)
                task = task_msg.content if task_msg else ""
            else:
                if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
                    return {"messages": [AIMessage(content=ERROR_NO_SKILL_REQUESTED)]}

                skill_call = last_msg.tool_calls[0]
                skill_id, task = (
                    skill_call["args"]["skill_id"],
                    skill_call["args"]["task_description"],
                )
                # Save tool_call_id for later use
                state["tool_call_id"] = skill_call["id"]

            logger.info(f"MomAI: Activated skill '{skill_id}'")

            skill = extension_manager.get_skill(skill_id)
            if not skill:
                return {"messages": [ToolMessage(content=ERROR_SKILL_NOT_FOUND, tool_call_id=state.get("tool_call_id", "unknown"))]}

            # Prepare skill instructions
            # Performance: optimized with to_thread
            await asyncio.to_thread(skill.load_full_content)
            
            # Inject Date/Time to Specialist
            now = datetime.now()
            current_time_info = f"Current Date: {now.strftime('%B %d, %Y')}\nCurrent Time: {now.strftime('%H:%M')}"

            mem_context = state.get("memory_context")
            system_instructions = (
                f"{get_language_instruction()}\n\n"
                f"# CONTEXT\n{current_time_info}\n\n"
                f"# ROLE: {skill.name}\n{skill.full_instructions}\n\n"
            )

            if mem_context:
                system_instructions += f"{mem_context}\n\n"

            # Dynamic Tool Filtering
            tool_limits = skill.get_tool_limits()
            prompt_limit = tool_limits.get("search", tool_limits.get("default", PREVIEW_TOOL_LIMIT))

            system_instructions += SPECIALIST_INSTRUCTIONS_TEMPLATE.format(
                task=task, prompt_limit=prompt_limit
            )

            # Lazy load tools for this specific skill
            skill_tools = await asyncio.to_thread(skill.get_tools)
            tool_usage = state.get("tool_usage", {}) or {}

            available_tools = []
            if skill_tools:
                for t in skill_tools:
                    limit = tool_limits.get(t.name, tool_limits["default"])
                    if tool_usage.get(t.name, 0) < limit:
                        available_tools.append(t)
                    else:
                        log_event("Guardrail", f"Tool '{t.name}' reached its limit ({limit}).")

            prompt = ChatPromptTemplate.from_messages([
                ("system", system_instructions),
                ("human", "{task}")
            ])
            worker_llm = llm.bind_tools(available_tools) if available_tools else llm

            # Tool results from previous iteration
            tool_results = state.get("tool_results", [])
            if tool_results:
                results_text = "\n\n".join(tool_results)
                user_input = PREVIOUS_RESULTS_TEMPLATE.format(
                    count=len(tool_results), results_text=results_text, task=task
                )
            else:
                user_input = task

            import time
            start_time = time.time()
            full_worker_msg = None
            async for chunk in (prompt | worker_llm).astream({"task": user_input}):
                if full_worker_msg is None:
                    full_worker_msg = chunk
                else:
                    full_worker_msg += chunk

            worker_res = full_worker_msg
            end_time = time.time()
            elapsed = end_time - start_time
            
            tokens = count_tokens(str(worker_res.content)) if hasattr(worker_res, "content") else 0
            tps = tokens / elapsed if elapsed > 0 else 0.0
            
            resp_str = str(worker_res.content) if hasattr(worker_res, "content") else str(worker_res)
            total_tools = len(worker_res.tool_calls) if hasattr(worker_res, "tool_calls") and worker_res.tool_calls else 0
            
            print_execution_panel(
                title=f"SPECIALIST: {skill_id}",
                valid_history=[], # Don't duplicate history in this context display
                response_content=resp_str,
                color="green",
                tools=state.get("tool_usage"),
                available_tools=available_tools,
                task=task,
                tool_results=tool_results
            )

            # 1. Standard Tool Calls
            if hasattr(worker_res, "tool_calls") and worker_res.tool_calls:
                return {
                    "messages": [worker_res],
                    "active_skill_id": skill_id
                }

            # 2. Fallback Parsing (Fuzzy match)
            final_content = worker_res.content if hasattr(worker_res, "content") else str(worker_res)
            
            if available_tools and final_content:
                parsed_tool_name = None
                parsed_arg = None
                tool_map = {t.name: t for t in available_tools}

                for tname in tool_map:
                    pat = re.escape(tname) + r'\s*\(\s*["\']?(.+?)["\']?\s*\)'
                    m = re.search(pat, final_content)
                    if m:
                        parsed_tool_name = tname
                        parsed_arg = m.group(1).strip().strip("\"'")
                        break

                if parsed_tool_name:
                    target_tool = tool_map[parsed_tool_name]
                    schema = getattr(target_tool, "args_schema", None)
                    first_field = list(schema.__fields__.keys())[0] if schema and schema.__fields__ else "query"
                    
                    synthetic_call_id = f"fallback_{uuid.uuid4().hex[:8]}"
                    synthetic_msg = AIMessage(
                        content="",
                        tool_calls=[{
                            "id": synthetic_call_id,
                            "name": parsed_tool_name,
                            "args": {first_field: parsed_arg},
                        }],
                    )
                    log_event("Specialist", f"Fallback parser used: {parsed_tool_name}")
                    return {
                        "messages": [synthetic_msg],
                        "active_skill_id": skill_id
                    }

            # 3. Final Answer (wrap as ToolMessage for the graph loop)
            tool_call_id = state.get("tool_call_id")
            if not tool_call_id and hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
                tool_call_id = last_msg.tool_calls[0]["id"]

            return {
                "messages": [
                    ToolMessage(
                        content=str(final_content),
                        tool_call_id=tool_call_id or "unknown",
                    )
                ],
                "active_skill_id": None
            }

        except Exception as e:
            logger.error(f"Error in specialist_node: {str(e)}")
            tid = state.get("tool_call_id", "unknown")
            return {"messages": [ToolMessage(content=f"Error: {str(e)}", tool_call_id=tid)]}

    def route_discovery(state: AgentState):
        """Dynamic routing: jumps to specialist if a shortcut was found during discovery."""
        if state.get("fast_path"):
            return "momai_agent"
        
        if not state.get("messages"):
            return "momai_agent"
            
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            if any(tc.get("name") == "activate_skill" for tc in last_msg.tool_calls):
                return "specialist_worker"
        
        return "momai_agent"
    

    def search_counter_node(state: AgentState):
        """Extract search count from tool_usage and emit for UI."""
        usage = state.get("tool_usage", {}) or {}
        count = (
            usage.get("search", 0)
            + usage.get("duckduckgo_search", 0)
            + usage.get("duckduckgo_news", 0)
            + usage.get("web_search", 0)
            + usage.get("news_search", 0)
        )

        if count > 0:
            logger.debug(f"[Search] Total searches in this turn: {count}")

        return {"search_count": count}

    def extract_sources_node(state: AgentState):
        """Extract URLs, titles and extras from ALL tool results - accumulates from all searches."""
        sources = []
        seen_urls = set()
        all_extras = []
        snippets = []
        cards = []

        # Process external memory notes first
        mem_notes = state.get("memory_notes")
        if mem_notes:
            for note in mem_notes:
                url = f"momai://note/{note.get('note_id', 'unknown')}"
                if url not in seen_urls:
                    seen_urls.add(url)
                    sources.append(
                        {
                            "url": url,
                            "title": f"Nota: {note.get('title', 'Sem título')}",
                            "snippet": note.get("text", "")[:MAX_SNIPPET_LENGTH],
                        }
                    )

        # Iterate through all messages to find ToolMessages with extras or structured content
        any_valid_tool_data = False
        for msg in state["messages"]:
            if not isinstance(msg, ToolMessage):
                continue

            # 1. Check for explicit 'extras' protocol (highest priority)
            has_extras = (
                hasattr(msg, "additional_kwargs")
                and msg.additional_kwargs
                and "extras" in msg.additional_kwargs
            )
            if has_extras:
                any_valid_tool_data = True
                extras = msg.additional_kwargs["extras"]
                if extras.get("sources"):
                    all_extras.extend(extras.get("sources", []))
                if extras.get("snippets"):
                    snippets.extend(extras.get("snippets", []))
                if extras.get("cards"):
                    cards.extend(extras.get("cards", []))

            # 2. Heuristic extraction for tools that return lists/dicts but didn't use the extras protocol
            content = msg.content
            results = None

            try:
                # Try to parse stringified Python/JSON content
                parsed = (
                    ast.literal_eval(content) if isinstance(content, str) else content
                )
                if isinstance(parsed, (list, dict)):
                    results = parsed if isinstance(parsed, list) else [parsed]
            except Exception:
                try:
                    results = (
                        json.loads(content) if isinstance(content, str) else content
                    )
                    if isinstance(results, dict):
                        results = [results]
                except:
                    results = None

            if results and isinstance(results, list):
                for item in results:
                    if isinstance(item, dict):
                        url = (
                            item.get("link") or item.get("href") or item.get("url", "")
                        )
                        if (
                            url
                            and isinstance(url, str)
                            and (url.startswith("http") or url.startswith("momai://"))
                        ):
                            any_valid_tool_data = True
                            url = re.sub(r"['\"]*,?}$", "", url).strip()
                            title = item.get("title", "") or item.get("name", "")
                            snippet = (
                                item.get("snippet", "")
                                or item.get("body", "")
                                or item.get("text", "")
                                or item.get("description", "")
                            )
                            if url not in seen_urls:
                                seen_urls.add(url)
                                sources.append(
                                    {
                                        "url": url,
                                        "title": title or url,
                                        "snippet": snippet[:MAX_SNIPPET_LENGTH]
                                        if snippet
                                        else "",
                                    }
                                )

        if not any_valid_tool_data and not mem_notes:
            return {"sources": None}

        # Merge explicit extras into sources list
        if all_extras:
            for src in all_extras:
                if src.get("url") and src["url"] not in seen_urls:
                    seen_urls.add(src["url"])
                    sources.append(src)
            logger.debug(f"[Extras] Merged {len(all_extras)} sources from extras")

        if sources:
            logger.debug(f"[Sources] Total of {len(sources)} sources accumulated")

        result = {"sources": sources if sources else None}
        if snippets:
            result["snippets"] = snippets
        if cards:
            result["cards"] = cards

        return result

    async def dynamic_tools_node(state: AgentState):
        try:
            last_msg = state["messages"][-1]
            if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
                return {"messages": []}
            registry = get_all_tools_registry()
            tool_messages = []
            tool_usage = state.get("tool_usage", {}) or {}

            for tc in last_msg.tool_calls:
                tool_name = tc["name"]
                tool = registry.get(tool_name)

                # Dynamic Limit Detection
                skill_id = state.get("skill_id")
                if skill_id:
                    skill = extension_manager.get_skill(skill_id)
                    tool_limits = skill.get_tool_limits() if skill else {}
                else:
                    tool_limits = {}

                # 1. Check Tool-Level Limit (metadata)
                # 2. Check Skill-Level Limit (tool_limits dict)
                # 3. Fallback to constant
                limit = DEFAULT_TOOL_LIMIT
                if hasattr(tool, "get_limit"):
                    limit = tool.get_limit(default=DEFAULT_TOOL_LIMIT)

                # Skill-level override has higher precedence if specific to the tool name
                if tool_name in tool_limits:
                    limit = tool_limits[tool_name]
                elif "default" in tool_limits:
                    limit = tool_limits["default"]

                # Check limits before execution (extra safety)
                tool_usage[tool_name] = tool_usage.get(tool_name, 0) + 1

                if tool and tool_usage[tool_name] <= limit:
                    try:
                        if tool_name != "activate_skill":
                            logger.info(f"MomAI: Executed tool '{tool_name}'")
                        res = await tool.ainvoke(tc["args"])
                        logger.debug(f"[Tools] Executed '{tool_name}' successfully")
                        processed_res, extras = extract_extras(res)

                        tool_msg_kwargs = {"tool_call_id": tc["id"]}
                        if extras:
                            tool_msg_kwargs["additional_kwargs"] = {"extras": extras}

                        tool_messages.append(
                            ToolMessage(content=str(processed_res), **tool_msg_kwargs)
                        )
                    except Exception as tool_err:
                        logger.error(
                            f"Error executing tool '{tool_name}': {str(tool_err)}"
                        )
                        tool_messages.append(
                            ToolMessage(
                                content=f"Tool execution failed: {str(tool_err)}",
                                tool_call_id=tc["id"],
                            )
                        )
                else:
                    # Tool missing or limit reached - provide feedback to LLM to break loop
                    reason = (
                        "Usage limit reached"
                        if tool
                        else "Tool not found or access denied"
                    )
                    logger.warning(f"[Guardrail] Blocking tool '{tool_name}': {reason}")
                    tool_messages.append(
                        ToolMessage(
                            content=SYSTEM_TOOL_LIMIT_REACHED.format(reason=reason),
                            tool_call_id=tc["id"],
                        )
                    )

            # Determine next step: if specialist called tools, go back to specialist; else go to manager
            has_skill_id = bool(state.get("skill_id"))
            next_step = "prepare_tool_results" if has_skill_id else "momai_agent"
            return {
                "messages": tool_messages,
                "tool_usage": tool_usage,
                "next_step": next_step,
            }
        except Exception as e:
            logger.error(f"Error in dynamic_tools_node: {str(e)}")
            # If the entire node fails, return empty messages to avoid crashing the graph
            return {"messages": [], "next_step": "momai_agent"}

    def prepare_tool_results(state: AgentState):
        """Convert ToolMessage results to format for specialist."""
        tool_results = []
        for msg in state["messages"]:
            if isinstance(msg, ToolMessage):
                tool_results.append(msg.content)
        return {"tool_results": tool_results, "next_step": None}

    workflow = StateGraph(AgentState)
    workflow.add_node("router", discovery_router)
    workflow.add_node("momai_agent", manager_node)
    workflow.add_node("specialist_worker", specialist_node)
    workflow.add_node("prepare_tool_results", prepare_tool_results)
    workflow.add_node("search_counter", search_counter_node)
    workflow.add_node("extract_sources", extract_sources_node)
    workflow.add_node("tools", dynamic_tools_node)

    workflow.set_entry_point("router")
    workflow.add_conditional_edges("router", route_discovery)

    def route_manager(state: AgentState):
        last_msg = state["messages"][-1]

        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return (
                "specialist_worker"
                if last_msg.tool_calls[0]["name"] == "activate_skill"
                else "tools"
            )
        return END

    def route_specialist(state: AgentState):
        """Route specialist output: if tool_calls, go to tools; else go to search_counter."""
        last_msg = state["messages"][-1]
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "tools"
        return "search_counter"

    def route_tools(state: AgentState):
        """Route tools output: if in a skill, prepare results first, else just extract sources."""
        if state.get("skill_id"):
            return "prepare_tool_results"
        return "extract_sources"

    def route_extract_sources(state: AgentState):
        """Route after source extraction: back to specialist if they still have tools to call, else back to manager."""
        last_msg = state["messages"][-1]
        # If the last worker response has tool calls, we must go back to tools (via specialist)
        if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            return "specialist_worker"

        # If no more tool calls from specialist, go back to manager to wrap up
        return "momai_agent"

    def route_search_counter(state: AgentState):
        """After search counter, go back to manager to see if more steps are needed."""
        return "momai_agent"

    workflow.add_conditional_edges("momai_agent", route_manager)
    workflow.add_conditional_edges("specialist_worker", route_specialist)
    workflow.add_conditional_edges("tools", route_tools)
    workflow.add_conditional_edges("extract_sources", route_extract_sources)
    workflow.add_conditional_edges("search_counter", route_search_counter)

    # Static edges for the data preparation flow
    workflow.add_edge("prepare_tool_results", "extract_sources")

    return workflow.compile(checkpointer=checkpointer)
