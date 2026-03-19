import os
import time
import platform
import subprocess
from pathlib import Path
from pydantic import BaseModel, Field
from langchain_core.tools import tool
import logging

logger = logging.getLogger("momai.skill.file_system.tools")

# Late-initialized references (set by plugin.py on startup)
_db = None
_user_home = None


def init_tools(db, user_home: Path):
    global _db, _user_home
    _db = db
    _user_home = user_home


class SearchInput(BaseModel):
    query: str = Field(description="Folder name or keyword to search for. E.g. 'Trabalhos', 'Fotos', 'Projects'.")


class PathInput(BaseModel):
    path: str = Field(description="Absolute path to the folder or file. E.g. 'C:/Users/Wesley/Documents'.")


@tool(args_schema=SearchInput)
def search_and_open_folder(query: str) -> str:
    """
    Searches indexed folders for a name matching the query and opens the best
    result directly in the native file explorer.
    Use this when the user asks to 'open a folder' by name.
    """
    if not _db:
        return "Error: File index not initialized."

    try:
        results = _db.search(query, limit=5)

        if not results:
            return f"No folders found matching '{query}'."

        exact = [r for r in results if r["name"].lower() == query.lower()]
        target = exact[0] if exact else results[0]

        target_path = Path(target["path"])
        if not target_path.exists():
            return f"Folder '{target['name']}' was indexed but no longer exists at {target['path']}."

        _open_native(target_path)

        if len(results) == 1 or exact:
            return f"Opened '{target['name']}' at {target['path']}."

        extras = "\n".join(f"  - {r['name']} -> {r['path']}" for r in results[1:])
        return f"Opened '{target['name']}' at {target['path']}.\nOther matches:\n{extras}"
    except Exception as e:
        logger.error(f"search_and_open_folder error: {e}")
        return f"Error: {str(e)}"


@tool(args_schema=SearchInput)
def search_folder_index(query: str) -> str:
    """
    Searches indexed folders and returns matching paths WITHOUT opening them.
    Use this when the user wants to FIND or KNOW WHERE a folder is.
    """
    if not _db:
        return "Error: File index not initialized."

    try:
        results = _db.search(query, limit=10)
        if not results:
            return f"No folders found matching '{query}'."

        lines = [f"Found {len(results)} matching folder(s):"]
        for r in results:
            lines.append(f"- {r['name']} -> {r['path']}")
        return "\n".join(lines)
    except Exception as e:
        logger.error(f"search_folder_index error: {e}")
        return f"Error: {str(e)}"


@tool(args_schema=PathInput)
def open_in_explorer(path: str) -> str:
    """
    Opens a specific absolute path in the native file explorer.
    Use when you already know the exact path.
    """
    try:
        p = Path(path).resolve()
        if not p.exists():
            return f"Path does not exist: {path}"

        _open_native(p)
        return f"Opened '{p}' in the file explorer."
    except Exception as e:
        logger.error(f"open_in_explorer error: {e}")
        return f"Error opening path: {str(e)}"


@tool(args_schema=PathInput)
def list_directory_content(path: str) -> str:
    """
    Lists all files and subdirectories within a given path.
    Useful for deeper navigation after finding a folder via search.
    """
    from fs_indexer import BLACKLIST

    try:
        p = Path(path).resolve()
        if not p.exists():
            return f"Path does not exist: {path}"
        if not p.is_dir():
            return f"Path is not a directory: {path}"

        items = []
        with os.scandir(p) as it:
            for entry in it:
                name = entry.name
                if name in BLACKLIST or name.startswith("."):
                    continue
                if entry.is_dir():
                    items.append(f"[DIR]  {name}/")
                else:
                    try:
                        size = entry.stat().st_size
                    except OSError:
                        size = 0
                    items.append(f"[FILE] {name} ({size} bytes)")

        items.sort()
        return "\n".join(items) if items else "Directory is empty."
    except PermissionError:
        return f"Permission denied: {path}"
    except Exception as e:
        logger.error(f"list_directory_content error: {e}")
        return f"Error: {str(e)}"


def _open_native(p: Path):
    if platform.system() == "Windows":
        os.startfile(str(p))
    elif platform.system() == "Darwin":
        subprocess.run(["open", str(p)], check=True)
    else:
        subprocess.run(["xdg-open", str(p)], check=True)
