import pluggy
from typing import List, Any, Dict

hookspec = pluggy.HookspecMarker("momai")
hookimpl = pluggy.HookimplMarker("momai")

class MomAIExtensionSpec:
    """Especificações de Hooks da MomAI.
    
    Qualquer extensão pode implementar esses hooks usando o decorator `@hookimpl`.
    Isso substitui o carregamento manual de classes/módulos, permitindo 
    um ciclo de vida padronizado e escalável.
    """
    
    @hookspec
    def register_tools(self, manifest: Dict[str, Any]) -> List[Any]:
        """
        Retorna as ferramentas LangChain (BaseTool) que esta extensão fornece.
        Para alta performance, os imports pesados devem ocorrer SOMENTE dentro do _run das ferramentas.
        """
        pass
        
    @hookspec
    def on_agent_start(self, config: Dict[str, Any]):
        """
        Hook executado no boot do sistema ou antes do agente rodar.
        """
        pass
