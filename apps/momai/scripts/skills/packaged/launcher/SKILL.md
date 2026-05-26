---
name: launcher
description: Abre programas, aplicativos, pastas e arquivos no computador. Busca, navega e lista diretórios, arquivos e programas no sistema. Use quando o usuario pedir para abrir, executar, buscar, navegar, listar ou encontrar pastas, arquivos ou programas.
icon: launcher
tags:
  - sistema
  - launcher
  - arquivos
author: WesleyQDev
repo: WesleyQDev/momai-extension-launcher
version: 1.0.0
intents:
  - abrir
  - abra
  - abra o
  - abrir programa
  - abrir pasta
  - abrir arquivo
  - executar
  - iniciar
  - iniciar programa
  - abrir aplicativo
  - abrir app
  - abrir diretorio
  - abrir diretório
  - localizar arquivo
  - encontrar pasta
  - open
  - launch
  - run
  - start
  - pasta
  - pastas
  - diretório
  - diretorio
  - navegar
  - listar pasta
  - listar diretório
  - explorar
  - procurar
  - buscar
  - encontrar
  - localizar
  - achar
  - caminho
  - path
  - folder
  - directory
  - browse
  - navigate
  - find
  - search
  - list
allowed-tools: search_local_items open_local_item
compatibility: MomAI Node Core
---

# Launcher Skill

Abre programas, aplicativos, pastas e arquivos no computador do usuario. Busca em todo o sistema: Menu Iniciar, Desktop, Program Files, AppData, PATH, Documentos, Downloads.

## Quando usar

- Usuario pedir para abrir um programa (ex: "abra o Chrome", "abrir calculadora")
- Usuario pedir para abrir uma pasta (ex: "abra a pasta Documents", "abrir Downloads")
- Usuario pedir para abrir um arquivo (ex: "abra o relatorio", "abrir foto")
- Usuario pedir para encontrar algo no computador

## Comportamento

1. Use `search_programs` com o nome do item que o usuario quer abrir
2. A skill retorna resultados similares (pastas, programas, arquivos, atalhos) como cards clicaveis
3. **IMPORTANTE: NUNCA abra automaticamente quando o usuario apenas pede para "achar", "encontrar", "buscar" ou "procurar"** — nesses casos, apenas mostre os resultados e pergunte qual abrir
4. **SO abra automaticamente** quando o usuario diz explicitamente "abra X", "abrir X", "execute X", "inicie X"
5. Se houver multiplos resultados, exibe cards clicaveis no chat
6. O usuario pode clicar no card para abrir diretamente, ou digitar o numero/nome da opcao

## Regras Importantes

- SEMPRE use `search_programs` para encontrar o item primeiro
- NUNCA tente abrir caminhos arbitarios que nao vieram da busca
- **NUNCA auto-abra em queries de busca** ("ache a pasta dev", "encontre o Chrome", "procure por X")
- **SO auto-abra em queries de abertura** ("abra a pasta dev", "abrir Chrome", "execute X")
- A busca inclui: pastas do usuario, programas instalados, atalhos, arquivos de documentos/downloads
- Se houver duvida, mostre as opcoes e pergunte qual abrir
- SE O USUARIO escolher uma opcao especifica, chame `open_program` com o path correspondente
- SE O USUARIO clicar no card, o sistema abre automaticamente sem precisar do LLM
