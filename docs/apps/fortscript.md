# FortScript

Gerenciador de processos Python que **pausa scripts automaticamente** quando jogos ou aplicações pesadas são detectados, e **retoma** quando fechados.

## Stack

- **Python 3.10+**
- **psutil** (monitoramento de processos)
- **PyYAML** (configuração)
- **CLI** via `fort` command

## Instalação

```bash
# Como dependência de projeto
uv add fortscript

# Global (CLI)
pipx install fortscript
```

## Arquitetura

O FortScript monitora continuamente a lista de processos do sistema operacional:

1. Inicia os projetos configurados como subprocessos
2. A cada intervalo, verifica se há processos "pesados" rodando
3. Se detectar, pausa (SIGSTOP no Linux/SuspendThread no Windows) os processos gerenciados
4. Quando os processos pesados fecham, retoma (SIGCONT/ResumeThread)
5. Também monitora uso de RAM com histerese (threshold/safe)

## Funcionalidades

- Detecção automática de jogos e apps pesados
- Pausa por limite de RAM (com histerese)
- Lista embutida de 150+ jogos e apps (`from fortscript import GAMES`)
- Callbacks: `on_pause` e `on_resume`
- Suporte a Python (com `.venv`), Node.js (`npm start`), executáveis (.exe)
- Configuração via YAML ou código Python
- Graceful shutdown + force kill
- Health monitoring (restart automático)

## Configuração

### YAML (`fortscript.yaml`)

```yaml
projects:
  - name: "Meu Bot"
    path: "./bot/main.py"
  - name: "API Node"
    path: "./api/package.json"

heavy_processes:
  - name: "GTA V"
    process: "gta5"

ram_threshold: 90
ram_safe: 80
log_level: "INFO"
```

### Python

```python
from fortscript import FortScript, GAMES, RamConfig

app = FortScript(
    projects=[{"name": "Bot", "path": "./bot/main.py"}],
    heavy_process=GAMES,
    ram_config=RamConfig(threshold=90, safe=80),
)
app.run()
```
