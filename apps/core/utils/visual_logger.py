"""
Visual Logger for Python core
Component-based log blocks with icons and colors
"""

import sys
import re
from datetime import datetime

RESET = '\x1b[0m'

COMPONENTS = {
    'model':     {'icon': '♦', 'color': '\x1b[35m', 'label': 'MODEL'},
    'chat':      {'icon': '◊', 'color': '\x1b[36m', 'label': 'CHAT'},
    'voice':     {'icon': '✺', 'color': '\x1b[33m', 'label': 'VOICE'},
    'tts':       {'icon': '♪', 'color': '\x1b[34m', 'label': 'TTS'},
    'detector':  {'icon': '▣', 'color': '\x1b[32m', 'label': 'DETECT'},
    'system':    {'icon': '⚙', 'color': '\x1b[90m', 'label': 'SYS'},
}

SEP = '─' * 40

def get_timestamp():
    now = datetime.now()
    return now.strftime('%H:%M:%S.%f')[:-3]

def detect_component(message):
    msg = message.lower()
    if 'llama' in msg or 'model' in msg:
        return 'model'
    if 'chat' in msg or 'assistant' in msg:
        return 'chat'
    if 'wake' in msg or 'detector' in msg:
        return 'detector'
    if 'tts' in msg or 'kokoro' in msg:
        return 'tts'
    if 'voice' in msg or 'stt' in msg or 'transcri' in msg:
        return 'voice'
    return 'system'

def visual_log(message, level='INFO'):
    component = detect_component(message)
    style = COMPONENTS.get(component, COMPONENTS['system'])
    timestamp = get_timestamp()
    
    # Print with icon and color
    icon = '✗' if level == 'ERROR' else '⚠' if level == 'WARN' else '✔'
    print(f"  {style['color']}{style['icon']}{RESET} {timestamp} {message} {icon}")

def info(message):
    visual_log(message, 'INFO')

def warn(message):
    visual_log(message, 'WARN')

def error(message):
    visual_log(message, 'ERROR')

def debug(message):
    visual_log(message, 'DEBUG')

def log_block(component, lines):
    style = COMPONENTS.get(component, COMPONENTS['system'])
    print(f"\n{style['color']}{style['icon']} {style['label']}{RESET}")
    print(f"{style['color']}{SEP}{RESET}")
    for line in lines:
        if isinstance(line, dict):
            print(f"  {line.get('timestamp', get_timestamp())}  {line.get('message', '')}")
        else:
            print(f"  {get_timestamp()}  {line}")
    print(f"{style['color']}{SEP}{RESET}\n")

if __name__ == '__main__':
    # Test
    info('[llama] Model loaded: llama-3.2-1b.gguf')
    warn('[voice] Wake word detection slow')
    error('[chat] Failed to stream response')
    
    log_block('model', [
        'Iniciando llama-server',
        'Modelo: llama-3.2-1b.gguf',
        '✔ Pronto (PID: 1234)'
    ])
