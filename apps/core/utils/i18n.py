import asyncio
import os

DEFAULT_LOCALE = os.getenv("MOMAI_LOCALE", "pt-BR")

_STRINGS = {
    "pt-BR": {
        "missing_capability_card_content": "Ainda nao aprendi a fazer isso, mas posso aprender com uma extensao.",
        "missing_capability_card_cta": "Abrir Loja de Extensoes",
        "suggest_ultra_card_content": "Como estou rodando em um modo de performance, minhas ferramentas de acesso à internet, criação de notas e lembretes estão desativadas. Por favor, mude para o Modo Ultra nas configurações se precisar que eu gerencie sua agenda, anotações ou busque informações em tempo real!",
        "suggest_ultra_card_cta": "Mudar para Modo Ultra",
        "no_tools_short_reply": "Posso aprender isso se voce instalar uma extensao.",
        "tool_protocol_chat_short": "Mantenha respostas curtas para TTS.",
        "tool_protocol_interface_threshold": "Use interface apenas para listas, tabelas, codigos, ou conteudo com mais de {min_chars} caracteres.",
        "tool_protocol_user_request": "Se o usuario pedir explicitamente para mostrar na interface, voce deve usar show_interface.",
        "llm_loading_message": "Aguarde um momento. Estou configurando meu motor para o modo {mode}.",
        "status_delegating": "Manager: Delegando para Especialista ({skill})...",
        "status_calling_tool": "Manager: Chamando ferramenta {tool}...",
        "status_finalizing": "Finalizando resposta...",
        "no_response_found": "Desculpe, não consegui formular uma resposta para isso.",
    },
    "en": {
        "missing_capability_card_content": "I can learn this if you install an extension.",
        "missing_capability_card_cta": "Open Extensions Store",
        "suggest_ultra_card_content": "Since I'm running in a performance mode, my internet, note creation and reminder tools are disabled. Please switch to Ultra Mode in settings if you need me to manage your schedule, notes or search for real-time information!",
        "suggest_ultra_card_cta": "Switch to Ultra Mode",
        "no_tools_short_reply": "I can learn this if you install an extension.",
        "tool_protocol_chat_short": "Keep chat replies short for TTS.",
        "tool_protocol_interface_threshold": "Use the interface only for lists, tables, code, or content over {min_chars} characters.",
        "tool_protocol_user_request": "If the user explicitly asks to show in the interface, you must call show_interface.",
        "llm_loading_message": "Please wait. I'm setting up my engine for {mode} mode.",
        "status_delegating": "Manager: Delegating to Specialist ({skill})...",
        "status_calling_tool": "Manager: Calling tool {tool}...",
        "status_finalizing": "Finalizing response...",
        "no_response_found": "Sorry, I couldn't formulate a response to that.",
    },
}

_ALIASES = {
    "en-US": "en",
    "en-GB": "en",
    "es": "en",
    "fr": "en",
    "de": "en",
    "it": "en",
}


def normalize_locale(locale: str | None) -> str:
    if not locale:
        return DEFAULT_LOCALE
    if locale in _STRINGS:
        return locale
    alias = _ALIASES.get(locale)
    if alias:
        return alias
    base = locale.split("-")[0]
    if base in _STRINGS:
        return base
    return locale


def get_locale() -> str:
    env_locale = os.getenv("MOMAI_LOCALE")
    if env_locale:
        return env_locale
    # For sync contexts, skip DB query - use default
    return DEFAULT_LOCALE


async def get_locale_async() -> str:
    env_locale = os.getenv("MOMAI_LOCALE")
    if env_locale:
        return env_locale
    try:
        from app_state import get_settings_cached

        settings = await get_settings_cached()
        if settings and settings.locale:
            return settings.locale
    except Exception:
        pass
    return DEFAULT_LOCALE


def t(key: str, locale: str | None = None, **kwargs) -> str:
    lang = normalize_locale(locale or get_locale())
    data = _STRINGS.get(lang) or _STRINGS.get("pt-BR", {})
    text = data.get(key, key)
    if kwargs:
        try:
            return text.format(**kwargs)
        except Exception:
            return text
    return text
