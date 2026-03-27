import sys
import logging
import os
import threading
from pathlib import Path
from typing import List

_ext_dir = str(Path(__file__).parent.absolute())
if _ext_dir not in sys.path:
    sys.path.append(_ext_dir)

from computer_tools import (
    analyze_active_window,
    click_element,
    type_text,
    take_optimized_screenshot,
    press_hotkey
)

logger = logging.getLogger("momai.skill.computer_control")

def _download_mmproj():
    try:
        from huggingface_hub import hf_hub_download
        from ai.providers.local_llama import get_paths
        
        paths = get_paths()
        models_dir = paths["models"]
        
        # Check if any mmproj already exists
        for f in models_dir.iterdir():
            if f.is_file() and "mmproj" in f.name.lower():
                logger.info(f"[Computer Control] Found existing mmproj: {f.name}")
                return
                
        logger.info("[Computer Control] No mmproj found. Downloading Qwen Image Encoder (VL mmproj)...")
        # Correct repository and file for Qwen 3.5 4B multimodal projection
        repo_id = "unsloth/Qwen3.5-4B-GGUF"
        filename = "mmproj-BF16.gguf"
        
        hf_hub_download(repo_id=repo_id, filename=filename, local_dir=str(models_dir))
        logger.info("[Computer Control] Download of the Image Encoder completed successfully!")
    except Exception as e:
        logger.error(f"[Computer Control] Failed to download Image Encoder: {e}")


class ComputerControlPlugin:
    def __init__(self, manifest):
        self.manifest = manifest
        # Initialize internal state or cache for element IDs
        self.elements_cache = {}

    def register_tools(self) -> List:
        return [
            analyze_active_window,
            click_element,
            type_text,
            take_optimized_screenshot,
            press_hotkey
        ]

    def on_startup(self):
        logger.debug(f"[Computer Control] Initialization started.")
        threading.Thread(target=_download_mmproj, daemon=True).start()

def initialize(manifest):
    plugin = ComputerControlPlugin(manifest)
    plugin.on_startup()
    return plugin
