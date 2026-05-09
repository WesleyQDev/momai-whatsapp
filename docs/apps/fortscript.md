# FortScript

## Visão Geral

FortScript é uma biblioteca Python independente e uma ferramenta CLI que gerencia processos de forma inteligente: ela **pausa automaticamente** scripts e aplicações quando jogos ou processos pesados são detectados, e os **retoma** quando esses processos são fechados.

Imagine que você está treinando um modelo de machine learning, rodando um web scraper, ou processando vídeos. Quando você abre um jogo, esses processos competem por recursos e podem prejudicar sua experiência. O FortScript resolve isso pausando os processos automaticamente e retomando quando você termina de jogar.

## Stack Tecnológica

| Tecnologia | Versão Mínima | Propósito |
|------------|---------------|-----------|
| Python | 3.10+ | Runtime |
| psutil | 7.1+ | Monitoramento de processos do SO |
| Pydantic | 2.12+ | Validação de configuração |
| PyYAML | 6.0+ | Parsing de configuração YAML |
| rich | 14.2+ | Interface CLI colorida |

## Arquitetura

O FortScript funciona como um **daemon de monitoramento** que:

1. **Inicia** os projetos configurados como subprocessos gerenciados
2. **Monitora** continuamente a lista de processos do sistema operacional
3. **Detecta** quando um processo "pesado" (jogo, app de edição, etc.) está rodando
4. **Pausa** os subprocessos gerenciados usando SIGSTOP (Linux) ou SuspendThread (Windows)
5. **Retoma** automaticamente quando os processos pesados são fechados
6. **Monitora RAM** com histerese (threshold ativa pausa, safe desativa)

## Funcionalidades

- **Detecção automática**: Reconhece 150+ jogos e aplicações populares pré-configurados
- **Pausa por RAM**: Se o uso de RAM ultrapassar um threshold configurável (ex: 90%), pausa processos automaticamente
- **Callbacks**: Funções `on_pause` e `on_resume` para integração personalizada
- **Múltiplos tipos de projeto**: Python (com `.venv`), Node.js (`npm start`), executáveis (.exe)
- **Configuração flexível**: YAML ou Python
- **Graceful shutdown**: Tenta encerrar processos graciosamente antes de force kill
- **Health monitoring**: Reinicia automaticamente processos que falham

## Instalação

```bash
# Como dependência de projeto
uv add fortscript

# CLI global
pipx install fortscript
```

## Uso

### CLI

```bash
# Com arquivo de configuração YAML
fort run --config fortscript.yaml

# Com configuração inline
fort run --project ./main.py
```

### API Python

```python
from fortscript import FortScript, GAMES, RamConfig

app = FortScript(
    projects=[
        {"name": "Bot", "path": "./bot/main.py"},
        {"name": "API", "path": "./api/package.json"}
    ],
    heavy_process=GAMES,  # Lista embutida de 150+ jogos
    ram_config=RamConfig(threshold=90, safe=80),
)

# Callbacks
@app.on_pause
def handle_pause(project, reason):
    print(f"Pausando {project['name']} devido a {reason}")

@app.on_resume
def handle_resume(project):
    print(f"Retomando {project['name']}")

app.run()
```

### Configuração YAML

```yaml
projects:
  - name: "Treinamento ML"
    path: "./train.py"
    type: python

  - name: "Web Scraper"
    path: "./scraper/"
    type: node

heavy_processes:
  - name: "GTA V"
    process: "gta5"
  - name: "Cyberpunk 2077"
    process: "Cyberpunk2077"

ram_threshold: 90
ram_safe: 80
interval: 2  # segundos entre verificações
log_level: "INFO"
```

## Configuração

O arquivo de configuração YAML define:

- **projects**: Lista de projetos a gerenciar (caminho, tipo, nome)
- **heavy_processes**: Processos que disparam a pausa
- **ram_threshold**: Percentual de RAM que ativa pausa
- **ram_safe**: Percentual de RAM que desativa pausa (histerese evita flutuações)
- **interval**: Intervalo entre verificações (segundos)

## Projeto Relacionado

O FortScript é usado internamente pelo MomAI para o **Modo Gaming**, que pausa automaticamente o servidor llama.cpp e outros processos de IA quando jogos são detectados.

## Links

- Repositório: [https://github.com/WesleyQDev/fortscript](https://github.com/WesleyQDev/fortscript)
- PyPI: `pip install fortscript`
