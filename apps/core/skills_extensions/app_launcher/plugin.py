import os
import sys
import logging
from pathlib import Path
from typing import List

# Ensure the extension directory is in sys.path for sibling imports
_ext_dir = str(Path(__file__).parent.absolute())
if _ext_dir not in sys.path:
    sys.path.append(_ext_dir)

from launcher_tools import (
    register_app,
    list_apps,
    open_app,
    remove_app,
    init_db
)

logger = logging.getLogger("momai.skill.app_launcher")


class AppLauncherPlugin:
    def __init__(self, manifest):
        self.manifest = manifest

        # Resolve core root from extension path: .../apps/core/skills_extensions/app_launcher
        extension_dir = Path(__file__).parent.absolute()
        core_root = extension_dir.parent.parent
        self.data_dir = core_root / "data" / "app_launcher"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        db_path = str(self.data_dir / "apps.json")
        init_db(db_path)

    def register_tools(self) -> List:
        return [
            register_app,
            list_apps,
            open_app,
            remove_app,
        ]

    def on_agent_start(self, config):
        pass


def initialize(manifest):
    plugin = AppLauncherPlugin(manifest)
    return plugin
