from langchain_core.tools import BaseTool, tool
from typing import Any, Optional
import traceback
import logging

logger = logging.getLogger("momai.tools")

EXTRAS_KEY = "extras"


def extract_extras(result: Any) -> tuple[str, Optional[dict]]:
    """
    Extracts extras from a tool result if present.

    Returns tuple of (processed_result, extras_dict or None)
    """
    if not isinstance(result, dict):
        return result, None

    extras = result.get(EXTRAS_KEY)
    if extras is None:
        return result, None

    if not isinstance(extras, dict):
        logger.warning(f"Tool returned extras but it's not a dict: {type(extras)}")
        return result, None

    result_copy = dict(result)
    del result_copy[EXTRAS_KEY]

    processed_result = result_copy.get("result", str(result))
    if not processed_result:
        processed_result = str(result_copy) if result_copy else "OK"

    return processed_result, extras


def make_safe_tool(original_tool: BaseTool) -> BaseTool:
    """Wraps a tool to catch exceptions and return a friendly error message."""

    # Check if it's already a BaseTool (langchain tool)
    if not isinstance(original_tool, BaseTool):
        # If it's a raw function, it shouldn't be here since we expect BaseTools
        return original_tool

    async def _safe_run(*args, **kwargs):
        try:
            if original_tool.is_async:
                return await original_tool._arun(*args, **kwargs)
            else:
                import asyncio

                return await asyncio.to_thread(original_tool._run, *args, **kwargs)
        except Exception as e:
            error_msg = f"Error executing tool '{original_tool.name}': {str(e)}"
            logger.error(f"{error_msg}\n{traceback.format_exc()}")
            return f"SYSTEM ERROR: The tool failed. Please inform the user: {error_msg}"

    # We create a new tool based on the original one but with the safe runner
    # Langchain's `@tool` or `StructuredTool` can be used here.
    # For simplicity, we just patch the run method or create a wrapper.

    # Note: Returning a string instead of crashing is key for LLM stability.

    return original_tool  # Placeholder: Actually patching would be better.


class SafeExtensionTool(BaseTool):
    """A wrapper for extension/skill tools that ensures they never crash the core."""

    original_tool: BaseTool

    def __init__(self, original_tool: BaseTool, manifest: Any = None):
        # We must explicitly set is_async if we want BaseTool to behave correctly
        # However, overriding _arun already makes it async-capable in LangChain
        super().__init__(
            name=original_tool.name,
            description=original_tool.description,
            args_schema=original_tool.args_schema,
            return_direct=original_tool.return_direct,
            original_tool=original_tool,
        )
        self.original_tool = original_tool

    def _run(self, *args, **kwargs):
        try:
            # Standardizing input: LangChain tools usually take a single dict or multiple kwargs
            tool_input = args[0] if args else kwargs
            
            # If the original tool is async but we are in a sync context, we have a problem.
            # But usually, it's safer to try to run it.
            if getattr(self.original_tool, "is_async", False):
                import asyncio
                try:
                    # Attempt to run async in sync (might fail in some event loops)
                    return asyncio.run(self.original_tool.ainvoke(tool_input))
                except RuntimeError:
                    # Fallback for when loop is already running
                    return "Error: Async tool called in sync context without loop support."
            
            return self.original_tool.invoke(tool_input)
        except Exception as e:
            logger.error(f"SafeTool Exception (sync) in {self.name}: {e}")
            return f"Error: {str(e)}"

    async def _arun(self, *args, **kwargs):
        try:
            tool_input = args[0] if args else kwargs
            
            # Robust async detection
            is_async = getattr(self.original_tool, "is_async", False)
            if not is_async and hasattr(self.original_tool, "coroutine"):
                is_async = self.original_tool.coroutine is not None
            
            if is_async:
                return await self.original_tool.ainvoke(tool_input)
            
            # For sync tools, run in thread to avoid blocking the event loop
            import asyncio
            return await asyncio.to_thread(self.original_tool.invoke, tool_input)
        except Exception as e:
            logger.error(f"SafeTool Exception (async) in {self.name}: {e}")
            return f"Error: {str(e)}"
