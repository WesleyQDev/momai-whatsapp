import os
import sys
import logging
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
        logger.info(f"[File System] Starting – User home: {self.user_home}")
        try:
            self.indexer.scan()
        except Exception as e:
            logger.info(f"[File System] Scan check: {e}")


def initialize(manifest):
    plugin = FileSystemPlugin(manifest)
    # Start background indexing immediately after init
    plugin.on_startup()
    return plugin
