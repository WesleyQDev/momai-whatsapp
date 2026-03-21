import os
import json
import logging
import platform
import subprocess
from pathlib import Path
from pydantic import BaseModel, Field
from langchain_core.tools import tool

logger = logging.getLogger("momai.skill.app_launcher.tools")

_db_path = None

def init_db(db_path: str):
    global _db_path
    _db_path = db_path
    if not os.path.exists(_db_path):
        with open(_db_path, "w", encoding="utf-8") as f:
            json.dump({}, f)

def _load_apps() -> dict:
    if not _db_path or not os.path.exists(_db_path):
        return {}
    try:
        with open(_db_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading apps DB: {e}")
        return {}

def _save_apps(apps: dict):
    if not _db_path:
        return
    try:
        with open(_db_path, "w", encoding="utf-8") as f:
            json.dump(apps, f, indent=4)
    except Exception as e:
        logger.error(f"Error saving apps DB: {e}")

class RegisterAppInput(BaseModel):
    name: str = Field(description="Name of the application. E.g. 'Chrome', 'Photoshop'.")
    path: str = Field(description="Absolute path to the executable file. E.g. 'C:/Program Files/Google/Chrome/Application/chrome.exe'.")

class AppNameInput(BaseModel):
    name: str = Field(description="Name of the registered application.")

@tool(args_schema=RegisterAppInput)
def register_app(name: str, path: str) -> str:
    """
    REGISTRA um novo aplicativo.
    Use quando o usuário pedir para registrar, salvar ou adicionar um aplicativo (ex: 'Registre o Fortnite em C:\\...').
    """
    apps = _load_apps()
    name_key = name.lower().strip()
    
    p = Path(path).resolve()
    if not p.exists():
        return f"O caminho informado não existe: {path}. Verifique o caminho e tente novamente."
        
    apps[name_key] = {"name": name.strip(), "path": str(p)}
    _save_apps(apps)
    return f"Aplicativo '{name}' registrado com sucesso no caminho '{path}'."

@tool
def list_apps() -> str:
    """
    LISTA os aplicativos armazenados.
    USE APENAS quando o usuário pedir expressamente para ver, listar, ou mostrar os aplicativos.
    NÃO USE esta ferramenta se o usuário pedir para ABRIR um aplicativo. (Para abrir, use open_app).
    """
    apps = _load_apps()
    if not apps:
        return "Nenhum aplicativo registrado ainda."
    
    result = []
    for key, data in apps.items():
        result.append({
            "title": data["name"],
            "url": "momai://note/app_launcher", 
            "snippet": f"Caminho: {data['path']}"
        })
        
    return json.dumps(result, ensure_ascii=False)

@tool(args_schema=AppNameInput)
def open_app(name: str) -> str:
    """
    ABRE ou INICIA um aplicativo previamente registrado pelo seu nome.
    USE ESTA FERRAMENTA SEMPRE que o usuário pedir para ABRIR, INICIAR ou RODAR um app (ex: 'Abrir Fortnite', 'Inicie o Chrome').
    NÃO use list_apps para isso.
    """
    apps = _load_apps()
    name_key = name.lower().strip()
    
    if name_key not in apps:
        found = None
        for key in apps.keys():
            if name_key in key or key in name_key:
                found = key
                break
        
        if not found:
            return f"Aplicativo '{name}' não encontrado nos registros. Você pode listar os apps disponíveis ou pedir o caminho para registrá-lo."
        name_key = found
        
    app_data = apps[name_key]
    path = app_data["path"]
    
    try:
        p = Path(path)
        if not p.exists():
            return f"O executável do '{app_data['name']}' não existe em {path}."
            
        if platform.system() == "Windows":
            os.startfile(str(p))
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p)])
            
        return f"Sucesso: Aplicativo '{app_data['name']}' foi aberto!"
    except Exception as e:
        logger.error(f"Error opening app: {e}")
        return f"Erro ao tentar abrir '{app_data['name']}': {str(e)}"

@tool(args_schema=AppNameInput)
def remove_app(name: str) -> str:
    """
    REMOVE ou DELETA um aplicativo dos registros.
    Use quando o usuário pedir para esquecer ou remover um app.
    """
    apps = _load_apps()
    name_key = name.lower().strip()
    
    if name_key in apps:
        del apps[name_key]
        _save_apps(apps)
        return f"Aplicativo '{name}' removido dos registros."
    return f"Aplicativo '{name}' não encontrado."
