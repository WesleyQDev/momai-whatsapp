import os
import json
import logging
from typing import Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool
import pyautogui
from PIL import Image
from io import BytesIO
import base64

logger = logging.getLogger("momai.skill.computer_control.tools")

# Attempt to load UIA for native Windows elements parsing.
try:
    import uiautomation as auto
    UI_AUTO_AVAILABLE = True
except ImportError:
    UI_AUTO_AVAILABLE = False
    logger.warning("uiautomation not installed. 'analyze_active_window' will be limited.")

# Global cache to map sequential IDs back to real coordinates / elements
_ui_elements_cache = {}

class AnalyzeInput(BaseModel):
    max_depth: int = Field(default=3, description="Depth of UI tree (1-5). Use smaller numbers to save LLM context.")

class ElementActionInput(BaseModel):
    element_id: int = Field(description="Numerical ID of the element to interact with, retrieved from analyze_active_window.")

class TypeInput(BaseModel):
    element_id: int = Field(description="Numerical ID of the input field.")
    text: str = Field(description="Text to type into the field.")

class HotkeyInput(BaseModel):
    keys: str = Field(description="Keys to press separated by '+' (e.g., 'ctrl+c', 'win+r', 'enter').")

class ScreenshotInput(BaseModel):
    compress_level: int = Field(default=70, description="Quality/size limit. 0=lowest res, 100=highest.", ge=0, le=100)
    grayscale: bool = Field(default=True, description="Change to gray to save base64 string length significantly.")


@tool(args_schema=AnalyzeInput)
def analyze_active_window(max_depth: int = 3) -> str:
    """
    Analisa a janela ativa e retorna uma árvore textual dos botões, campos e textos visíveis com IDs numéricos.
    Uso: Substitui a necessidade de enviar a imagem da tela, economizando MILHARES de tokens de contexto.
    Retorna uma lista resumida, por exemplo: '[25] Botão "Avançar"', que pode ser usada com click_element(25).
    """
    global _ui_elements_cache
    _ui_elements_cache.clear()

    if not UI_AUTO_AVAILABLE:
        return "Erro: O pacote 'uiautomation' não está instalado na máquina. Peça ao usuário para instalar via 'uv pip install uiautomation' ou use hotkeys/screenshots."

    try:
        window = auto.GetForegroundControl()
        if not window:
            return "Nenhuma janela ativa detectada."

        result_lines = [f"Janela Ativa: {window.Name} ({window.ControlTypeName})"]
        counter = 1

        def traverse(control, depth):
            nonlocal counter
            if depth > max_depth:
                return
            
            # Filtro: pegar apenas elementos interactables ou com nome
            if control.ControlTypeName in ['ButtonControl', 'EditControl', 'DocumentControl', 'ListItemControl', 'WindowControl', 'TabItemControl', 'HyperlinkControl', 'MenuItemControl']:
                if control.Name or control.ControlTypeName:
                    # Guardar boundings para clicar depois
                    rect = control.BoundingRectangle
                    if rect and rect.width() > 0 and rect.height() > 0:
                        _ui_elements_cache[counter] = rect
                        name_str = control.Name.strip() if control.Name else "<Sem Nome>"
                        ident = "  " * (3 - max_depth + depth)
                        result_lines.append(f"{ident}[{counter}] {control.ControlTypeName}: '{name_str[:40]}'")
                        counter += 1

            # Evitar travar mapeando filhos infinitamente
            try:
                for child in control.GetChildren():
                    traverse(child, depth + 1)
            except Exception:
                pass

        traverse(window, 1)

        result_text = "\n".join(result_lines)
        if len(result_text) > 3000:
            result_text = result_text[:3000] + "\n... (Truncated para salvar contexto. Diminua o max_depth!) :"
            
        return result_text

    except Exception as e:
        logger.error(f"Erro no analyze: {e}")
        return f"Falha ao analisar UI: {str(e)}"


@tool(args_schema=ElementActionInput)
def click_element(element_id: int) -> str:
    """
    Clica em um elemento específico da tela baseado no ID gerado pela ferramenta `analyze_active_window`.
    Isso abstrai coordenadas para o LLM.
    """
    if element_id not in _ui_elements_cache:
        return f"Erro: ID [{element_id}] não encontrado no cache. Execute analyze_active_window novamente."

    rect = _ui_elements_cache[element_id]
    x = rect.left + (rect.width() // 2)
    y = rect.top + (rect.height() // 2)

    try:
        pyautogui.click(x, y)
        return f"Clique realizado com sucesso no elemento {element_id} (Coordenada estimada no centro)."
    except Exception as e:
        return f"Falha ao clicar: {e}"


@tool(args_schema=TypeInput)
def type_text(element_id: int, text: str) -> str:
    """
    Clica no elemento pelo ID (geralmente um EditControl) e digita o texto passado.
    """
    if element_id not in _ui_elements_cache:
        return f"Erro: ID [{element_id}] não encontrado no cache."

    rect = _ui_elements_cache[element_id]
    x = rect.left + (rect.width() // 2)
    y = rect.top + (rect.height() // 2)
    
    try:
        pyautogui.click(x, y)
        pyautogui.write(text, interval=0.01)
        return f"Texto '{text}' digitado com sucesso no elemento {element_id}."
    except Exception as e:
        return f"Erro ao digitar: {e}"


@tool(args_schema=HotkeyInput)
def press_hotkey(keys: str) -> str:
    """
    Pressiona uma combinação de teclas (ex: 'ctrl+c', 'win+d', 'enter', 'tab'). 
    Ótimo para navegação cega sem precisar de screenshots (otimização de contexto).
    """
    key_list = [k.strip().lower() for k in keys.split('+')]
    try:
        pyautogui.hotkey(*key_list)
        return f"Atalho {keys} executado."
    except Exception as e:
        return f"Erro no atalho {keys}: {e}"


@tool(args_schema=ScreenshotInput)
def take_optimized_screenshot(compress_level: int = 50, grayscale: bool = True) -> list:
    """
    Tira um print da tela, redimensiona, e retorna a imagem diretamente no formato visual esperado pelo LLM Multimodal.
    Use isto quando precisar 'enxergar' textualmente a interface para achar cliques que não aparecem na árvore de acessibilidade.
    MUITO CUSTOSO EM TOKENS! Use apenas se analyze_active_window não bastar.
    """
    try:
        img = pyautogui.screenshot()
        
        if grayscale:
            img = img.convert('L')
            
        # Otimização bruta baseada no nível de compressão (0-100)
        # Se compress_level é 50, vamos diminuir a resolução para 50% do original
        scale_factor = max(0.1, compress_level / 100.0)
        new_width = int(img.width * scale_factor)
        new_height = int(img.height * scale_factor)
        
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=min(85, int(compress_level)))
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        prompt_instruction = "Esta é a captura atual da tela."
        
        # O LLM com Vision Encoder conseguirá analisar a imagem se passarmos dessa forma:
        return [
            {"type": "text", "text": f"Captura de tela enviada com sucesso.\n[{prompt_instruction}]"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_str}"}}
        ]
    except Exception as e:
        return [{"type": "text", "text": f"Erro ao gerar screenshot: {str(e)}"}]
