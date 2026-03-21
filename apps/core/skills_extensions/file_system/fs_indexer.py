import os
import time
import platform
import string
from pathlib import Path
from typing import List, Set, Dict
import logging

logger = logging.getLogger("momai.skill.file_system.indexer")

BLACKLIST: Set[str] = {
    # Windows system
    "$Recycle.Bin", "System Volume Information", "Recovery",
    "Windows", "Windows.old", "PerfLogs", "Config.Msi",
    "System32", "SysWOW64", "WinSxS", "servicing",
    # Program folders (too deep, no user data)
    "Program Files", "Program Files (x86)", "ProgramData",
    # User hidden/system folders
    "AppData", "Local Settings", "Application Data",
    # Dev junk
    ".git", "node_modules", "__pycache__", ".venv", ".env", "venv",
    ".next", ".turbo", ".gemini", ".cache", ".tmp",
    "dist", "build", ".idea", ".vs", ".vscode",
    # Package managers
    ".npm", ".yarn", ".pnpm-store", ".nuget", ".cargo", ".rustup",
    # Other
    "MSOCache", "Intel", "AMD", "NVIDIA",
}


def _get_drive_roots() -> List[Path]:
    """Returns all available drive roots on the system."""
    if platform.system() == "Windows":
        drives = []
        for letter in string.ascii_uppercase:
            drive = Path(f"{letter}:\\")
            if drive.exists():
                drives.append(drive)
        return drives

    # macOS / Linux: scan from root but skip system dirs
    return [Path("/")]


class FolderIndexer:
    def __init__(self, db, max_depth: int = 6):
        self.db = db
        self.max_depth = max_depth

    def scan(self, force: bool = False):
        """
        Scans drives for folders. Now runs every time, but inserts are 'OR IGNORE'
        to keep existing indexed data and only add new folders.
        """
        roots = _get_drive_roots()
        logger.debug(f"[File System] Scanning {len(roots)} drive(s) (Full Scan depth={self.max_depth})")
        start_time = time.time()
        total_indexed = 0

        for root in roots:
            batch: List[Dict] = []
            try:
                self._recursive_scan(str(root), 0, batch)
                if batch:
                    self.db.insert_folders(batch)
                    total_indexed += len(batch)
            except Exception as e:
                logger.error(f"Error scanning drive {root}: {e}")

        elapsed = time.time() - start_time
        logger.debug(f"[File System] Scan completed in {elapsed:.2f}s. {total_indexed} total folders processed.")

    def _recursive_scan(self, current_path: str, current_depth: int, batch: List[Dict]):
        if current_depth > self.max_depth:
            return

        try:
            with os.scandir(current_path) as it:
                for entry in it:
                    if not entry.is_dir(follow_symlinks=False):
                        continue
                    if entry.name.startswith(".") or entry.name in BLACKLIST:
                        continue

                    try:
                        mtime = entry.stat().st_mtime
                    except (OSError, PermissionError):
                        mtime = 0.0

                    batch.append({
                        "name": entry.name,
                        "path": entry.path,
                        "depth": current_depth,
                        "last_mtime": mtime,
                    })

                    if len(batch) >= 1000:
                        self.db.insert_folders(batch)
                        batch.clear()

                    self._recursive_scan(entry.path, current_depth + 1, batch)
        except (PermissionError, OSError):
            pass
