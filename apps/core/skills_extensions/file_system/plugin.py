import os
import sys
import logging
import threading
from pathlib import Path
from typing import List

# Ensure the extension directory is in sys.path for sibling imports
_ext_dir = str(Path(__file__).parent.absolute())
if _ext_dir not in sys.path:
    sys.path.append(_ext_dir)

from fs_database import FileIndexDB
from fs_indexer import FolderIndexer
from fs_tools import (
    init_tools,
    search_and_open_folder,
    search_folder_index,
    open_in_explorer,
    list_directory_content,
)

logger = logging.getLogger("momai.skill.file_system")


class FileSystemPlugin:
    def __init__(self, manifest):
        self.manifest = manifest

        # Resolve core root from extension path: .../apps/core/skills_extensions/file_system
        extension_dir = Path(__file__).parent.absolute()
        core_root = extension_dir.parent.parent
        self.data_dir = core_root / "data" / "file_system"
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.db = FileIndexDB(str(self.data_dir / "file_index.db"))
        self.user_home = Path(os.path.expanduser("~")).absolute()
        self.indexer = FolderIndexer(self.db, max_depth=6)

        init_tools(self.db, self.user_home)

    def register_tools(self) -> List:
        return [
            search_and_open_folder,
            search_folder_index,
            open_in_explorer,
            list_directory_content,
        ]

    def on_startup(self):
        """Runs the file scan in a background thread to not block the main process."""
        logger.debug(f"[File System] Initializing in background thread.")
        try:
            # Start scan in a daemon thread so it doesn't block shutdown
            thread = threading.Thread(target=self.indexer.scan, daemon=True)
            thread.start()
        except Exception as e:
            logger.error(f"[File System] Failed to start background scan: {e}")


def initialize(manifest):
    plugin = FileSystemPlugin(manifest)
    # Start background indexing immediately – won't block the core anymore
    plugin.on_startup()
    return plugin
