import os
import json
import sys
from pathlib import Path

def create_extension(name: str):
    # Converte Nome Para ID (slug)
    ext_id = name.lower().replace(" ", "_").strip()
    
    # Caminho base (assume execução na raiz do projeto ou em apps/core)
    base_path = Path("apps/core/skills_extensions") / ext_id
    
    if base_path.exists():
        print(f"Error: Extension {ext_id} already exists at {base_path}")
        return

    base_path.mkdir(parents=True)
    
    # 1. Create SKILL.md (The new universal manifest)
    skill_content = f"""---
name: {name}
description: Description for {name}
intents:
  - Usar a extensão {name}
  - Peça ajuda ao {name}
metadata:
  author: Your Name
  version: 0.1.0
  icon: Puzzle
  has_sidebar: false
---

You are the {name} specialist. Your goal is to help the user with specialized tasks.
"""
    
    with open(base_path / "SKILL.md", "w", encoding="utf-8") as f:
        f.write(skill_content)

    # 2. Create plugin.py (Optional but added by default for extensions)
    plugin_content = f"""from langchain_core.tools import tool
from typing import List

class {name.replace(" ", "")}Plugin:
    def __init__(self, manifest):
        self.manifest = manifest

    def register_tools(self) -> List:
        \"\"\"
        Registra as ferramentas no sistema.
        \"\"\"
        return [{ext_id}_tool]

    def on_startup(self):
        \"\"\"Executado ao carregar a extensão no boot.\"\"\"
        print(f"[{name}] Inicializada!")

@tool
def {ext_id}_tool(param: str):
    \"\"\"Descreva o que esta ferramenta faz aqui.\"\"\"
    return f"Extensão {name} processou: {{param}}"

def initialize(manifest):
    \"\"\"Ponto de entrada para inicializar a classe da extensão.\"\"\"
    return {name.replace(" ", "")}Plugin(manifest)
"""
    
    with open(base_path / "plugin.py", "w", encoding="utf-8") as f:
        f.write(plugin_content)

    # 3. Create pyproject.toml for dependency management
    pyproject = f"""[project]
name = "{ext_id}"
version = "0.1.0"
description = "Description for {name}"
authors = [{{ name = "Your Name" }}]
dependencies = []

[build-system]
requires = ["setuptools", "wheel"]
build-backend = "setuptools.build_meta"
"""
    with open(base_path / "pyproject.toml", "w", encoding="utf-8") as f:
        f.write(pyproject)

    print(f"Extension {name} created successfully at {base_path}")
    print(f"ID: com.momai.extension.{ext_id}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_extension.py 'My Extension Name'")
    else:
        create_extension(sys.argv[1])
