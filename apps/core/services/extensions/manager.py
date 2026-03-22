import os
import sys
import logging
import json
import importlib.util
from pathlib import Path
from typing import List, Dict, Any, Optional
import pluggy
from domain.skill import Skill
from services.extensions.specs import MomAIExtensionSpec

logger = logging.getLogger(__name__)


class Extension(Skill):
    """
    An advanced Skill (Extension) that can have a plugin instance.
    Metadata like UI schemas, icons, and sidebar settings are stored 
    within the SKILL.md frontmatter metadata.
    """
    plugin: Optional[Any] = None

    @property
    def manifest(self) -> Dict[str, Any]:
        """Provides backward compatibility for UI expecting a manifest object."""
        # Assets and features now come primarily from metadata in SKILL.md
        m = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "intents": self.intents,
            "version": self.metadata.get("version", "0.1.0"),
            "author": self.metadata.get("author", "Unknown"),
            "icon": self.metadata.get("icon") or self.metadata.get("get_icon") or "Puzzle",
        }

        # Try to load full readme for detail view
        readme_content = ""
        skill_dir = Path(os.path.dirname(self.file_path))
        readme_path = skill_dir / "README.md"
        if readme_path.exists():
            try:
                readme_content = readme_path.read_text(encoding="utf-8")
            except:
                pass
        
        m["readme"] = readme_content
        
        # Features are strictly metadata driven now
        features = self.metadata.get("features") or {}
        if not features:
            features = {
                "sidebar": self.metadata.get("has_sidebar") or self.metadata.get("sidebar") or False,
                "ui_schema": self.metadata.get("ui_schema") or self.metadata.get("get_ui_schema"),
                "agent_name": self.metadata.get("agent_name") or self.id
            }
        
        m["features"] = features
        m["permissions"] = self.metadata.get("permissions") or {}
        
        return m

    @property
    def ui_schema(self) -> Optional[List[Dict[str, Any]]]:
        return self.metadata.get("ui_schema") or self.metadata.get("get_ui_schema")

    @classmethod
    def from_skill(cls, skill: Skill) -> "Extension":
        ext = cls(**skill.dict())
        
        # Check for plugin.py automatically
        skill_dir = Path(os.path.dirname(skill.file_path))
        plugin_path = skill_dir / "plugin.py"
        
        if plugin_path.exists():
            ext._load_plugin(plugin_path)
                
        return ext

    def _load_plugin(self, plugin_path: Path):
        try:
            spec = importlib.util.spec_from_file_location(
                f"ext_{self.id}", str(plugin_path)
            )
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = module
                spec.loader.exec_module(module)
                
                if hasattr(module, "plugin_instance"):
                    self.plugin = module.plugin_instance
                    # O registro no 'pluggy' será feito no get_tools do Registry,
                    # ou podemos registrar diretamente aqui se tivermos a referência
                    logger.debug(f"[Extension {self.id}] Plugin instanciado via Pluggy (plugin_instance).")
                elif hasattr(module, "initialize"):
                    self.plugin = module.initialize(self.manifest)
                    logger.debug(f"[Extension {self.id}] Plugin initialized via initialize().")
                else:
                    # Fallback: search for a class with 'Plugin' in the name
                    plugin_class = None
                    for name in dir(module):
                        if "Plugin" in name and name != "MomAIExtension":
                            plugin_class = getattr(module, name)
                            break
                    
                    if plugin_class and isinstance(plugin_class, type):
                        self.plugin = plugin_class(self.manifest)
                        logger.debug(f"[Extension {self.id}] Plugin initialized via class {plugin_class.__name__}.")
                    else:
                        logger.warning(f"[Extension {self.id}] No entry point found in plugin.py.")
        except Exception as e:
            logger.error(f"[Extension {self.id}] Error loading plugin: {e}")

    def get_plugin_tools(self) -> List[Any]:
        if not self.plugin:
            return []
        
        if hasattr(self.plugin, "register_tools"):
            try:
                # Tanto o estilo legacy quanto o novo Hook (@hookimpl) vão chamar este método
                # mas no caso do Pluggy, o manager também chamará tudo via self.pm.hook
                # Para evitar duplicidade se register_tools for um Hook, tratamos aqui:
                
                # Se for dict (manifest) é legacy
                import inspect
                sig = inspect.signature(self.plugin.register_tools)
                if len(sig.parameters) > 0:
                    tools = self.plugin.register_tools(self.manifest)
                else:
                    tools = self.plugin.register_tools()
                    
                return tools if isinstance(tools, list) else []
            except Exception as e:
                logger.error(f"[Extension {self.id}] register_tools error: {e}")
        return []

    def get_tools(self) -> List[Any]:
        """Returns tools from both tools.py and plugin."""
        tools = super().get_tools() # Loads from tools.py
        plugin_tools = self.get_plugin_tools()
        if plugin_tools:
            # Avoid duplicates if any
            tool_names = {t.name for t in tools if hasattr(t, "name")}
            for pt in plugin_tools:
                if hasattr(pt, "name") and pt.name not in tool_names:
                    tools.append(pt)
        return tools

    def call_hook(self, hook_name: str, *args, **kwargs) -> Any:
        """Calls a hook on the plugin instance if it exists."""
        if not self.plugin:
            return None
        
        if hasattr(self.plugin, hook_name):
            try:
                method = getattr(self.plugin, hook_name)
                return method(*args, **kwargs)
            except Exception as e:
                logger.error(f"[Extension {self.id}] Hook {hook_name} error: {e}")
        return None


class SkillRegistry:
    def __init__(self):
        self.base_dirs = {
            "builtin": Path(__file__).parent.parent.parent / "skills",
            "extensions": Path(__file__).parent.parent.parent / "skills_extensions",
            "user": self._get_user_extensions_dir(),
        }

        self.skills: Dict[str, Skill] = {}
        self._skill_tools: Dict[str, Any] = {}
        
        # 🔌 Setup do Pluggy PluginManager
        self.pm = pluggy.PluginManager("momai")
        self.pm.add_hookspecs(MomAIExtensionSpec)
        
        self._ensure_dirs()

    def _get_user_extensions_dir(self) -> Path:
        data_dir = os.environ.get("MOMAI_DATA_DIR")
        if data_dir:
            base = Path(data_dir)
        elif sys.platform == "win32":
            base = Path(os.path.expandvars("%APPDATA%")) / "MomAI"
        else:
            base = Path.home() / ".local" / "share" / "MomAI"
        return base / "skills_extensions"

    def _ensure_dirs(self):
        for d in self.base_dirs.values():
            d.mkdir(parents=True, exist_ok=True)

    def load_all(self, on_progress=None):
        """Discovers and loads all skills and extensions from configured directories."""
        self.skills.clear()
        self._skill_tools.clear()

        for category, base_path in self.base_dirs.items():
            try:
                if not base_path.exists():
                    continue

                if on_progress:
                    on_progress(f"Scanning {category}...")

                for item_dir in base_path.iterdir():
                    try:
                        if item_dir.is_dir():
                            if on_progress:
                                on_progress(f"Loading: {item_dir.name}")
                            self._load_item(item_dir, category)
                    except Exception as e:
                        logger.error(f"[SkillRegistry] Error at {item_dir}: {e}")
            except Exception as e:
                logger.error(f"[SkillRegistry] Error scanning {category}: {e}")

        self._invalidate_tools_cache()

    def _load_item(self, path: Path, category: str):
        """Loads a skill (SKILL.md) and upgrades it to Extension if plugin.py exists."""
        skill_id = path.name
        
        skill_path = None
        for filename in ["SKILL.md", "skill.md"]:
            potential = path / filename
            if potential.exists():
                skill_path = potential
                break

        if not skill_path:
            return

        try:
            # 1. Load basic skill
            skill = Skill.from_file(skill_id, str(skill_path))
            skill.metadata["category"] = category
            
            # Isoleted Environment: prepends `lib/` to sys.path if it exists
            lib_path = path / "lib"
            if lib_path.exists() and str(lib_path) not in sys.path:
                sys.path.insert(0, str(lib_path))
            
            # 2. Upgrade to Extension if plugin.py exists
            plugin_path = path / "plugin.py"
            if plugin_path.exists():
                item = Extension.from_skill(skill)
                # Opcional: Registra o plugin globalmente no PM
                if item.plugin:
                    plugin_name = f"ext_{skill_id}"
                    # Unregister to avoid "Plugin name already registered" error
                    # if the extensions are reloaded.
                    self.pm.unregister(name=plugin_name)
                    self.pm.register(item.plugin, name=plugin_name)
            else:
                item = skill
            
            self.skills[skill_id] = item
            
            # 3. Load tools - Chamado SOMENTE por demanda no agente depois
            item_tools = item.get_tools()
            if item_tools:
                from utils.safe_tools import SafeExtensionTool
                for t in item_tools:
                    if not hasattr(t, "name"): continue
                    safe_tool = SafeExtensionTool(original_tool=t)
                    self._skill_tools[safe_tool.name] = safe_tool
                    
        except Exception as e:
            logger.error(f"[SkillRegistry] Error loading item at {path}: {e}")

    def _invalidate_tools_cache(self) -> None:
        try:
            from tools.system_actions import invalidate_tools_registry_cache
            invalidate_tools_registry_cache()
        except Exception as e:
            logger.debug(f"[SkillRegistry] Invalidate cache error: {e}")

    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """Retrieves a skill by name or ID."""
        for s_id, skill in self.skills.items():
            if s_id == skill_id or skill.name == skill_id:
                return skill
        return None

    def get_all_skills(self) -> List[Dict]:
        """Returns all loaded skills and extensions formatted for UI."""
        result = []
        # Iterate over a copy of the dictionary to avoid 'changed size during iteration' errors
        # if the background loader is still running.
        for s_id, s in list(self.skills.items()):
            item = {
                "id": s_id,
                "name": s.name,
                "description": s.description,
                "category": s.metadata.get("category", "unknown"),
                "enabled": True, # For now, always True if loaded
            }
            
            # Add extension specific info
            if isinstance(s, Extension):
                item["is_extension"] = True
                item["manifest"] = s.manifest
                if s.ui_schema:
                    item["ui_schema"] = s.ui_schema
            
            result.append(item)
        return result

    def get_tools(self) -> List[Any]:
        """Returns all registered tools from all skills/extensions."""
        return list(self._skill_tools.values())

    # Simplified Hook interface for the rest of the system
    def execute_hook(self, hook_name: str, *args, **kwargs) -> List[Any]:
        """Executes a hook on all loaded extensions and returns the results."""
        results = []
        for skill in self.skills.values():
            if isinstance(skill, Extension):
                res = skill.call_hook(hook_name, *args, **kwargs)
                if res is not None:
                    results.append(res)
        return results


skill_registry = SkillRegistry()
extension_manager = skill_registry

