import sys
import logging
from pathlib import Path
from typing import List, Dict, Any

_ext_dir = str(Path(__file__).parent.absolute())
if _ext_dir not in sys.path:
    sys.path.append(_ext_dir)

from browser_tools import init_tools, get_browser_tools, stop_browser
from services.extensions.specs import hookimpl

logger = logging.getLogger("momai.skill.browser_automation")

class BrowserPlugin:
    
    @hookimpl
    def register_tools(self, manifest: Dict[str, Any]) -> List[Any]:
        # Inicializa a thread de forma lazy (não bloqueia o boot)
        init_tools()
        return get_browser_tools()
        
    @hookimpl
    def on_agent_start(self, config: Dict[str, Any]):
        logger.info("[Browser Automation] Plugin inicializado remotamente.")

# Instância exportada para o Pluggy descobrir
plugin_instance = BrowserPlugin()

