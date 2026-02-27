import re
import asyncio
import threading
from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
    trim_messages,
)
from ai.providers.local_llama import load_model, stop_server
import tools.system_actions as tools
import os
from tools.system_actions import TOOLS
import json
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
from ai.graph.workflow import create_momai_graph
from ai import utils
from ai.utils import (
    save_message_to_db, load_history_from_db, clean_response, 
    clean_text_for_tts, speak_and_notify, _is_missing_capability,
    _build_missing_capability_card
)
from ai.stream.processor import StreamProcessor

load_dotenv()
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import traceback
import logging
from datetime import datetime
from utils.tokenizer import count_message_tokens, get_context_window
from utils.i18n import t, get_locale
from tools.system_actions import show_chat_card
from ai.graph.prompts import SUMMARY_SYSTEM_PROMPT

logger = logging.getLogger("momai.ai")

data_dir = os.environ.get("MOMAI_DATA_DIR")
if data_dir:
    os.makedirs(data_dir, exist_ok=True)
    CHECKPOINT_PATH = os.path.join(data_dir, "checkpoints.db")
else:
    CHECKPOINT_PATH = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "checkpoints.db"
    )

# The checkpointer will be initialized by main.py in lifespan
checkpointer = None

MAX_MESSAGES = 4  # Optimized for local speed (fewer history tokens to process)
ULTRA_MODE_ACTION = utils.ULTRA_MODE_ACTION


# Note: save_message_to_db and load_history_from_db moved to ai.utils


# Note: Summary logic moved to ai.utils


# Note: get_graph_history and clear_history_db still in orchestrator
async def get_graph_history(thread_id: str):
    """
    Retrieves persistent history from LangGraph.

    Args:
        thread_id (str): The conversation thread ID.

    Returns:
        list: List of messages in the state.
    """
    if momai_graph is None or checkpointer is None:
        return []

    config = {"configurable": {"thread_id": thread_id}}
    try:
        # Retrieve state asynchronously
        state = await momai_graph.aget_state(config)
        if state and "messages" in state.values:
            return state.values["messages"]
    except Exception as e:
        logger.error(f"[AI_core] Error reading graph state: {e}")
    return []


async def clear_history_db(thread_id: str = None):
    """
    Clears database history and LangGraph memory.

    Args:
        thread_id (str, optional): The thread ID to clear. If None, clears all.
    """
    from database.models import SessionLocal, Message
    import aiosqlite

    # 1. Clear visual history (momai.db)
    db = SessionLocal()
    try:
        if thread_id:
            num = db.query(Message).filter(Message.thread_id == thread_id).delete()
            logger.info(
                f"[AI_core] Deleted {num} messages from momai.db (thread: {thread_id})"
            )
        else:
            num = db.query(Message).delete()
            logger.info(f"[AI_core] Deleted {num} messages from momai.db (all)")
        db.commit()
    except Exception as e:
        logger.error(f"[AI_core] Error clearing DB history: {e}")
    finally:
        db.close()

    # 2. Clear Graph memory (checkpoints.db) asynchronously
    try:
        async with aiosqlite.connect(CHECKPOINT_PATH, timeout=10) as conn:
            # Enable WAL to avoid "Database Is Locked"
            await conn.execute("PRAGMA journal_mode=WAL")
            if thread_id:
                await conn.execute(
                    "DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,)
                )
                await conn.execute(
                    "DELETE FROM writes WHERE thread_id = ?", (thread_id,)
                )
            else:
                await conn.execute("DELETE FROM checkpoints")
                await conn.execute("DELETE FROM writes")
            await conn.commit()
            logger.info(f"[AI_core] Graph memory cleared for thread: {thread_id or 'all'}")
    except Exception as e:
        logger.error(f"[AI_core] Error clearing checkpoints: {e}")

    # 3. Clear in-memory cache
    global chat_history
    if thread_id:
        if thread_id in chat_history:
            del chat_history[thread_id]
    else:
        chat_history = {}


llm = None
llm_with_tools = None
momai_graph = None
llm_mode = "waiting"
is_loading = False
cancel_generation = False
init_error = None
_init_lock = threading.Lock()
chat_history = {}  # Temporary history for fallback

llm_ready_event = threading.Event()


# Note: Utility functions moved to ai.utils
def initialize_llm(on_init_progress=None, tier=None, onboarding_bypass=False):
    """
    Initializes the Local LLM in a separate thread.

    Args:
        on_init_progress (callable, optional): Callback for initialization progress.
        tier (str, optional): AI tier to use (lite, pro, ultra).
        onboarding_bypass (bool): If True, bypasses the onboarding_completed check.
    """
    global is_loading, llm_mode, init_error

    llm_ready_event.clear()

    if on_init_progress is not None and not callable(on_init_progress):
        on_init_progress = None

    if utils.is_loading:
        return

    utils.is_loading = True
    utils.llm_mode = "local"
    init_error = None

    thread = threading.Thread(
        target=_initialize_llm_task, 
        args=(on_init_progress,), 
        kwargs={'provided_tier': tier, 'onboarding_bypass': onboarding_bypass}
    )
    thread.daemon = True
    try:
        thread.start()
    except RuntimeError as e:
        logger.error(f"[AI_core] Thread start error: {e}")


# AI Tiers Configuration
TIERS_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "ai_tiers.json")

def load_tier_config():
    """Loads AI tier configuration from JSON file or returns defaults."""
    defaults = {
        "lite": {
            "repo": "unsloth/LFM2.5-VL-1.6B-GGUF",
            "file": "LFM2.5-VL-1.6B-Q4_K_M.gguf",
        },
        "pro": {
            "repo": "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
            "file": "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
        },
        "ultra": {
            "repo": "unsloth/Qwen3-4B-Instruct-2507-GGUF",
            "file": "Qwen3-4B-Instruct-2507-UD-Q4_K_XL.gguf",
        }
    }
    
    if not os.path.exists(TIERS_CONFIG_PATH):
        return defaults

    try:
        with open(TIERS_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"[AI_core] Error loading ai_tiers.json: {e}")
        return defaults

TIER_CONFIG = load_tier_config()


def _initialize_llm_task(on_init_progress=None, provided_tier=None, onboarding_bypass=False):
    """Internal task to initialize the local LLM and rebuild the graph."""
    global llm, llm_with_tools, llm_mode, momai_graph, is_loading, init_error

    import app_state
    import asyncio

    def report_progress(status: str):
        logger.info(f"[AI_core] {status}")
        if callable(on_init_progress):
            on_init_progress(status)

        if app_state.main_loop:
            asyncio.run_coroutine_threadsafe(
                app_state.broadcast_to_sockets(
                    {
                        "type": "model_change_progress",
                        "data": {"mode": "local", "status": status},
                    }
                ),
                app_state.main_loop,
            )

    try:
        logger.info(f"--- Inicializando Motor de IA: LOCAL ---")

        tier = provided_tier
        from database.models import SessionLocal, Settings, init_db
        if not tier:
            db = SessionLocal()
            s = db.query(Settings).first()
            
            # Se o tier não foi definido, não carrega modelo.
            if not s or not s.ai_tier:
                logger.info("[AI_core] Tier não selecionado. Pulando carregamento automático.")
                is_loading = False
                llm_mode = "waiting"
                db.close()
                return

            if not s.onboarding_completed and not onboarding_bypass:
                logger.info("[AI_core] Onboarding pendente. Pulando carregamento automático.")
                is_loading = False
                llm_mode = "waiting"
                db.close()
                return

            tier = s.ai_tier
            u_name = str(s.user_name) if s else "Senhor"
            u_persona = str(s.assistant_persona) if s else None
            db.close()
        else:
            # Se o tier foi providenciado, buscamos os dados mínimos no banco
            db = SessionLocal()
            s = db.query(Settings).first()
            u_name = str(s.user_name) if s else "Senhor"
            u_persona = str(s.assistant_persona) if s else None
            db.close()

        # Refresh TIER_CONFIG from file
        tier_config = load_tier_config()
        
        if tier not in tier_config:
            tier = "pro"

        config = tier_config[tier]
        
        report_progress(f"Configurando motor Llama.cpp ({tier.upper()})...")
        new_llm = load_model(
            repo_id=config["repo"],
            filename=config["file"],
            ctx_size=config.get("ctx_size"),
            gpu_layers=config.get("gpu_layers"),
            on_progress=report_progress,
        )

        if new_llm:
            logger.info(f"[AI_core] Modelo Local instanciado. Reconstruindo Grafo...")
            report_progress("Atualizando conhecimento de ferramentas...")

            # Sync Vector DB with Tools/Skills (Only for Ultra since it's the only one with embeddings now)
            if tier == "ultra":
                try:
                    from utils.indexer import index_all_system_tools, index_all_skills

                    def _do_index():
                        import asyncio
                        asyncio.run(index_all_system_tools())
                        asyncio.run(index_all_skills())
                    import threading
                    threading.Thread(target=_do_index, daemon=True).start()
                except Exception as sync_err:
                    logger.warning(
                        f"[AI_core] Falha na sincronização de ferramentas: {sync_err}"
                    )
            else:
                logger.info("[AI_core] Modo Lite/Pro detectado. Sincronização vetorial feita conforme demanda.")

            report_progress("Reconstruindo Grafo de Agentes...")

            try:
                # Reconstroi o Grafo com novo LLM e configurações
                new_graph = create_momai_graph(
                    new_llm,
                    user_name=u_name,
                    assistant_persona=u_persona,
                    checkpointer=checkpointer,
                    tier=tier,
                )

                # ATOMIC UPDATE
                with _init_lock:
                    llm = new_llm
                    llm_with_tools = new_llm.bind_tools(TOOLS)
                    momai_graph = new_graph
                    llm_mode = "local"
                    tools.current_mode = "local"
                    init_error = None

                report_progress("Tudo pronto, Senhor!")
                logger.info(f"[AI_core] Motor de IA Local está pronto!")
            except Exception as graph_err:
                logger.error(f"[AI_core] Erro na Reconstrução do Grafo: {graph_err}")
                raise graph_err

            # Notifica o frontend
            if app_state.main_loop:
                asyncio.run_coroutine_threadsafe(
                    app_state.broadcast_to_sockets(
                        {"type": "model_changed", "data": {"new_mode": "local"}}
                    ),
                    app_state.main_loop,
                )
                # Scale: 30% - 100% (Electron takes 0% - 30%)
                asyncio.run_coroutine_threadsafe(
                    app_state.send_init_event("api", "Starting system protocols...", 32),
                    app_state.main_loop
                )
                asyncio.run_coroutine_threadsafe(
                    asyncio.to_thread(init_db),
                    app_state.main_loop
                )
                app_state.set_graph_state(None, False)

            is_loading = False
            llm_ready_event.set()

        else:
            raise Exception(f"Provedor Local não retornou uma instância válida.")

    except Exception as e:
        err_msg = str(e)
        logger.error(f"[AI_core] Erro Crítico de Inicialização: {err_msg}")
        init_error = err_msg
        utils.is_loading = False
        llm_ready_event.set()  # Unblock even on error

        if app_state.main_loop:
            asyncio.run_coroutine_threadsafe(
                app_state.broadcast_to_sockets(
                    {"type": "model_change_error", "data": {"message": err_msg}}
                ),
                app_state.main_loop,
            )
    finally:
        utils.is_loading = False


class ChatMessage(BaseModel):
    content: str
    thread_id: str = "default"


def clean_text_for_tts(text: str) -> str:
    """
    Removes Markdown formatting and special characters for natural voice.

    Args:
        text (str): Input text.

    Returns:
        str: Cleaned text for TTS.
    """
    # Remove <think> tags and content
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Remove bold/italic
    text = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", text)
    # Remove links
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    # Remove headers
    text = re.sub(r"#+\s?", "", text)
    # Remove code blocks
    text = re.sub(r"`+", "", text)
    # Remove function tags (fallback XML)
    text = re.sub(r"<function=.*?>.*?</function>", "", text, flags=re.DOTALL)
    # Remove bullet markers
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)

    return text.strip()


def clean_response(text: str) -> str:
    """
    Cleans residual tokens and terminal-breaking characters.
    """
    # Remove any reasoning/thought tags if present
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    text = re.sub(r"<\|.*?\|>", "", text).strip()
    text = re.sub(r"<function=.*?>.*?</function>", "", text, flags=re.DOTALL).strip()
    text = re.sub(
        r"^(MomAI|Assistant|Assistente)\s* : \s*", "", text, flags=re.IGNORECASE
    ).strip()
    # Remove non-BMP emojis for Windows terminal compatibility
    text = "".join(c for c in text if ord(c) <= 0xFFFF)
    return text


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

    # Se estivermos no modo conversa geral, não sugerimos extensões
    if current_agent == "responder":
        return {"apply": False}

    if no_tools_available is False:
        return {"apply": False}

    if not _is_missing_capability(assistant_text):
        return {"apply": False}

    locale = get_locale()
    
    # Se estiver no modo lite, sugerimos Ultra ao inves de Extensões se o contexto for de limitações
    from database.models import SessionLocal, Settings
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
    options = [action]
    options_map = {action: cta_label}
    show_chat_card.invoke(
        {"content": content, "options": options, "options_map": options_map}
    )


def safe_speak(text):
    try:
        import services.voice.tts as tts

        tts.speak_sentence(text)
    except RuntimeError as e:
        logger.warning(f"[AI_core] TTS Speak Thread Error ignored: {e}")
    except Exception as e:
        logger.error(f"[AI_core] TTS Speak Error: {e}")


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


async def speak_and_notify(text: str) -> None:
    if not text:
        return
    safe_speak(text)


async def generate(message: ChatMessage):
    """
    Main stream generator for chat responses.
    Delegates implementation to StreamProcessor for better maintainability.
    """
    processor = StreamProcessor(
        message_content=message.content,
        thread_id=message.thread_id,
        graph=momai_graph,
        llm=llm
    )
    
    async for chunk in processor.process():
        yield chunk
