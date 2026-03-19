import os
from pathlib import Path
from typing import List
from langchain_community.agent_toolkits import FileManagementToolkit
import logging
import platform
import subprocess

logger = logging.getLogger("momai.skill.file_system")

class FileSystemPlugin:
    def __init__(self, manifest):
        self.manifest = manifest
        # Define um diretório raiz seguro para as operações de arquivo
        # Usamos apps/core/data/storage como padrão
        self.root_dir = Path("apps/core/data/storage").absolute()
        
        if not self.root_dir.exists():
            self.root_dir.mkdir(parents=True, exist_ok=True)
            
        self.toolkit = FileManagementToolkit(
            root_dir=str(self.root_dir),
            selected_tools=["read_file", "write_file", "list_directory", "move_file", "copy_file", "file_delete", "file_search"]
        )

    def register_tools(self) -> List:
        """
        Registra as ferramentas do FileManagementToolkit e as customizadas.
        """
        from langchain_core.tools import StructuredTool

        def open_in_explorer_func(folder_path: str = ".") -> str:
            """
            Opens a folder in the computer's file explorer.
            The folder_path is relative to the internal storage root.
            """
            try:
                full_path = (self.root_dir / folder_path).resolve()
                
                # Security check: ensures the path is inside the root_dir
                if not str(full_path).startswith(str(self.root_dir)):
                     return f"Erro: Caminho fora do diretório raiz permitido."

                if not full_path.exists():
                    return f"Erro: O diretório '{folder_path}' não existe."

                # Platform-specific opening
                if platform.system() == "Windows":
                    os.startfile(str(full_path))
                elif platform.system() == "Darwin":  # macOS
                    subprocess.run(["open", str(full_path)], check=True)
                else:  # Linux
                    subprocess.run(["xdg-open", str(full_path)], check=True)

                return f"Sucesso: Abrindo '{folder_path}' no explorador de arquivos."
            except Exception as e:
                logger.error(f"[File System] Erro ao abrir explorer: {e}")
                return f"Erro ao abrir explorador: {str(e)}"

        open_explorer_tool = StructuredTool.from_function(
            func=open_in_explorer_func,
            name="open_in_explorer",
            description="Opens a folder in the computer's file explorer. Path is relative to root storage."
        )

        tools = self.toolkit.get_tools()
        tools.append(open_explorer_tool)
        return tools

    def on_startup(self):
        """Executado ao carregar a extensão no boot."""
        logger.info(f"[File System] Inicializada! Root: {self.root_dir}")

def initialize(manifest):
    """Ponto de entrada para inicializar a classe da extensão."""
    return FileSystemPlugin(manifest)
