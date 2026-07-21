---
description: Lista os comandos OpenCode customizados disponíveis no projeto, lendo o README.md da pasta commands e apontando os não-documentados
---

## Passo 1 — Ler o README e os arquivos

1. Leia `.opencode/commands/README.md`.
2. Extraia a tabela de comandos: linhas no formato `| /xxx | descrição |`.
3. Liste todos os arquivos `.md` dentro de `.opencode/commands/` (ignorando `README.md` e o próprio arquivo sendo executado).

## Passo 2 — Cruzar os dados

Para cada `.md` encontrado:
- Se o comando (nome do arquivo sem `.md`, prefixado com `/`) aparece na tabela do README, está documentado.
- Se não aparece, está não-documentado.

## Passo 3 — Exibir resultado

Saída em PT-BR, formato limpo no terminal:

```
### 🧰 Comandos OpenCode disponíveis

Comando      | O que faz
-------------|-----------
/auditoria   | Auditoria completa do código com relatório PDF
/changelog   | Gerencia o changelog...
...
```

No final, se houver comandos não-documentados:

```
### 📝 Não documentados no README
- `/comandos` (existe o arquivo mas não está no README)
```

Se todos estiverem documentados:

```
✅ Todos os X comandos estão documentados no README.
```

## Regras

- Somente leitura. Nunca edite nenhum arquivo.
- Liste os comandos na ordem em que aparecem no README.
- Não-documentados em ordem alfabética ao final.
- Se o README.md não existir ou estiver vazio, diga "Nenhum comando documentado ainda" e liste todos `.md` encontrados.
