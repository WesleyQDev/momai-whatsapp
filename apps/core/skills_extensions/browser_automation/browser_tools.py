import os
import threading
import queue
import logging
from pydantic import BaseModel, Field
from langchain_core.tools import tool

logger = logging.getLogger("momai.skill.browser_automation.tools")

class BrowserActionThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.task_queue = queue.Queue()
        self.result_queue = queue.Queue()
        self.page = None
        self._playwright_context = None
        self._browser = None
        self._p_instance = None

    def _ensure_browser(self):
        """Certifica que o Playwright e o browser estão rodando dentro da thread."""
        from playwright.sync_api import sync_playwright
        
        if self._p_instance is None:
            self._p_instance = sync_playwright().start()
        
        # Se o browser não existe ou foi fechado (ex: o usuário fechou a janela)
        if self._browser is None or not self._browser.is_connected():
            logger.info("Iniciando nova instância do navegador Chromium...")
            self._browser = self._p_instance.chromium.launch(headless=False)
            self.page = self._browser.new_page()
        
        # Se a página foi fechada mas o browser ainda está lá
        if self.page is None or self.page.is_closed():
            self.page = self._browser.new_page()

    def run(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.error("Playwright is not installed. Browser action thread will not start.")
            return

        while True:
            task = self.task_queue.get()
            if task is None:
                break
            
            try:
                # Lazy initialization/Re-initialization
                self._ensure_browser()
                
                func, args, kwargs = task
                res = func(self.page, *args, **kwargs)
                self.result_queue.put(("success", res))
            except Exception as e:
                logger.error(f"Browser action failed: {e}")
                self.result_queue.put(("error", str(e)))
            finally:
                self.task_queue.task_done()
        
        # Cleanup on stop
        if self._browser:
            self._browser.close()
        if self._p_instance:
            self._p_instance.stop()

    def execute(self, func, *args, **kwargs):
        if not self.is_alive():
            # Tenta reiniciar a thread se ela não estiver viva por algum motivo
            self.start()
            
        self.task_queue.put((func, args, kwargs))
        status, res = self.result_queue.get()
        if status == "error":
            raise Exception(res)
        return res
        
    def stop(self):
        if self.is_alive():
            self.task_queue.put(None)


browser_thread: BrowserActionThread = None

def init_tools():
    global browser_thread
    if browser_thread is None:
        # Apenas instancia a thread, mas o loop do run() só abrirá o browser no primeiro comando
        browser_thread = BrowserActionThread()
        browser_thread.start()

def get_browser_tools() -> list:
    return [
        browser_navigate,
        browser_extract_text,
        browser_click,
        browser_fill_input,
        browser_press_key
    ]

def stop_browser():
    global browser_thread
    if browser_thread is not None:
        browser_thread.stop()
        browser_thread = None


# --- Pydantic Inputs ---

class NavigateInput(BaseModel):
    url: str = Field(description="The full URL to navigate to, e.g., 'https://www.google.com'")

class ClickInput(BaseModel):
    selector: str = Field(description="A CSS or XPath selector of the element to click. Do not include quotes inside selector.")

class FillInput(BaseModel):
    selector: str = Field(description="A CSS or XPath selector of the input element.")
    text: str = Field(description="The text to type into the input element.")

# --- Browser actions executed by the thread ---

def _do_navigate(page, url):
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    page.goto(url, timeout=60000, wait_until="networkidle")
    return f"Navigated successfully to {page.url}"

def _do_extract_text(page):
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return "Erro: A biblioteca 'beautifulsoup4' não está instalada. Execute 'uv pip install beautifulsoup4'."

    html = page.content()
    soup = BeautifulSoup(html, "html.parser")
    # Remove script and style elements
    for script in soup(["script", "style", "noscript", "meta", "head", "title"]):
        script.extract()
    text = soup.get_text(separator=' ', strip=True)
    
    title = page.title()
    current_url = page.url
    
    # Trim to avoid exceeding context limits
    MAX_CHARS = 8000 
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "...[truncated]"
        
    return f"Page Title: {title}\nURL: {current_url}\nContent:\n{text}"

def _do_click(page, selector):
    page.click(selector, timeout=10000)
    page.wait_for_load_state("domcontentloaded")
    return f"Clicked on element '{selector}'."

def _do_fill(page, selector, text):
    page.fill(selector, text, timeout=10000)
    return f"Filled text '{text}' into '{selector}'."

def _do_press(page, key):
    page.keyboard.press(key)
    page.wait_for_load_state("domcontentloaded")
    return f"Pressed key '{key}' on the keyboard."

# --- Langchain Tools ---

class KeyboardInput(BaseModel):
    key: str = Field(description="A tecla a ser pressionada no teclado, como 'Enter', 'Escape', 'Tab', etc.")


@tool(args_schema=NavigateInput)
def browser_navigate(url: str) -> str:
    """
    Navigates the browser to the specified URL and waits for it to load.
    Always prioritize full URLs (like https://google.com).
    """
    global browser_thread
    try:
        return browser_thread.execute(_do_navigate, url)
    except Exception as e:
        return f"Error navigating: {str(e)}"

@tool
def browser_extract_text() -> str:
    """
    Extracts purely visible text content from the current browser page.
    Use this immediately after navigating somewhere or clicking a link to understand where you are.
    """
    global browser_thread
    try:
        return browser_thread.execute(_do_extract_text)
    except Exception as e:
        return f"Error extracting text: {str(e)}"

@tool(args_schema=ClickInput)
def browser_click(selector: str) -> str:
    """
    Clicks an element on the current page using a valid CSS, XPath ou Playwright Text selector.
    Examples of excellent selectors:
    - 'text="Pular"'
    - 'button[aria-label="Search"]'
    - 'id=search'
    - '[placeholder="Pesquisar"]'
    """
    global browser_thread
    try:
        return browser_thread.execute(_do_click, selector)
    except Exception as e:
        return f"Error clicking element: {str(e)}"

@tool(args_schema=FillInput)
def browser_fill_input(selector: str, text: str) -> str:
    """
    Types text into an input field designated by a CSS, XPath or Playwright selector.
    Use selectors that make sense like '[name="search_query"]' or '[placeholder="Pesquisar"]'.
    You will likely need to use `browser_press_key` with "Enter" right after filling this.
    """
    global browser_thread
    try:
        return browser_thread.execute(_do_fill, selector, text)
    except Exception as e:
        return f"Error filling input: {str(e)}"

@tool(args_schema=KeyboardInput)
def browser_press_key(key: str) -> str:
    """
    Extremely useful to press specific keys on the page. 
    Use this right after filling an input with `browser_fill_input` by passing key="Enter" to submit the search cleanly.
    """
    global browser_thread
    try:
        return browser_thread.execute(_do_press, key)
    except Exception as e:
        return f"Error pressing key: {str(e)}"
