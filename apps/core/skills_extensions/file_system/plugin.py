import os
from pathlib import Path
from typing import List
from langchain_community.agent_toolkits import FileManagementToolkit
from langchain_core.tools import tool

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
        Registra as ferramentas do FileManagementToolkit no sistema.
        """
        return self.toolkit.get_tools()

    def on_startup(self):
        """Executado ao carregar a extensão no boot."""
        print(f"[File System] Inicializada! Root: {self.root_dir}")

def initialize(manifest):
    """Ponto de entrada para inicializar a classe da extensão."""
    return FileSystemPlugin(manifest)
