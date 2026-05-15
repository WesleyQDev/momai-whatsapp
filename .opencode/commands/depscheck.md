---
description: Auditoria de dependências com análise de segurança, performance e breaking changes
---

Você é um engenheiro de software sênior especializado em gerenciamento de dependências. Faça uma auditoria completa de todas as dependências do projeto e recomende atualizações com segurança.

## Regras de Ouro

1. **Performance > Tudo**: Se uma atualização reduz performance, NÃO atualize. Perda de performance é inaceitável.
2. **Breaking changes exigem teste**: Só atualize se os testes existentes cobrirem a funcionalidade afetada.
3. **Só atualize se houver motivo claro**: Segurança (CVE conhecido) ou ganho de performance comprovado.
4. **Não atualize por atualizar**: Versão mais nova não é motivo. Mudanças cosméticas ou de estilo não justificam risco.

## Processo

### Fase 1: Mapear dependências

Leia TODOS os arquivos de dependência do projeto:

| App | Arquivo | Gerenciador |
|-----|---------|-------------|
| Root | `package.json` | pnpm |
| MomAI Desktop | `apps/momai/package.json` | pnpm |
| MomAI Core | `apps/core/pyproject.toml` | uv (pip) |
| FortScript | `apps/fortscript/pyproject.toml` | uv (pip) |
| Landing Page | `apps/landing-page/package.json` | pnpm |
| Promo Video | `apps/momai-promo-video/package.json` | pnpm |

Extraia TODAS as dependências (produção e dev) com suas versões atuais.

### Fase 2: Verificar versões disponíveis

Para cada dependência, descubra a versão mais recente disponível:

**pnpm/npm packages**: Use a API do npm registry:
```
https://registry.npmjs.org/{package}/latest
```

**Python packages**: Use a API do PyPI:
```
https://pypi.org/pypi/{package}/json
```

Crie uma tabela consolidada: | Pacote | App | Versão Atual | Versão Latest | Diferença | Tipo |

### Fase 3: Filtrar candidatas

Remova da lista:
- Pacotes já na versão mais recente
- Pacotes com diferença apenas de patch (X.Y.Z → X.Y.Z+1) a menos que tenham CVE
- Pacotes pinned com range restrito intencionalmente (ex: `<4.8.0`)

Mantenha:
- Pacotes com diferença minor (X.Y → X.Y+1) ou major (X → X+1)
- Qualquer pacote com CVE conhecido na versão atual
- Pacotes que o usuário explicitamente pediu para verificar (`$ARGUMENTS`)

### Fase 4: Investigação paralela por subagente

Para cada dependência candidata (máximo 8 por vez, loteie se houver mais), dispare um subagente via Task tool em paralelo.

Cada subagente deve receber esta tarefa:

```
Analise a dependência "{package}" no projeto MomAI.
- App: {app}
- Versão atual: {current}
- Versão latest: {latest}
- Gerenciador: {pnpm/uv}

Tarefas:
1. Acesse o changelog/release notes entre {current} e {latest}
   - npm/pnpm: use `https://registry.npmjs.org/{package}` para ver todas as versões
   - PyPI: use `https://pypi.org/pypi/{package}/json` para ver todas as versões
   - Depois acesse GitHub releases ou changelog do pacote

2. Identifique:
   a) **Breaking changes** declarados nas releases
   b) **CVEs/security fixes** corrigidos
   c) **Performance changes** (mais rápido, mais lento, mais memória)
   d) **Mudanças na API pública** que o MomAI usa

3. Para entender o USO no MomAI, procure referências ao pacote no código:
   - Grep por import/require do pacote em apps/{app}/
   - Se não achar imports diretos, o pacote pode ser dependência transitiva — avise

4. Verifique se existem testes que cobrem esse pacote:
   - Procure por arquivos *.test.*, *.spec.*, __tests__/ em apps/{app}/
   - grep por imports mockados ou referências no código de teste

5. Conclusão:
   - 🟢 **Pode atualizar**: sem breaking changes, seguro, ganho de perf/security
   - 🟡 **Atualizar com cautela**: breaking changes pequenos, mas testes cobrem
   - 🔴 **Não atualizar**: breaking changes grandes, sem testes, perda de performance
   - Justifique em 2-3 parágrafos

Retorne UM resumo conciso com: pacote, versão atual → latest, breaking changes (lista), CVEs (lista), perf impact, recommendation (🟢/🟡/🔴), justificativa.
```

Aguarde TODOS os subagentes terminarem antes de prosseguir.

### Fase 5: Gerar relatório consolidado

Crie `depsreports/depscheck-YYYY-MM-DD-HH-mm-ss.md`:

#### Capa
- Título: "Dependency Audit Report - MomAIOS"
- Data da análise
- Total de dependências analisadas: N
- Total de candidatas a atualização: N

#### Sumário Executivo

| Status | Quantidade |
|--------|-----------|
| 🟢 Pode atualizar | N |
| 🟡 Atualizar com cautela | N |
| 🔴 Não atualizar | N |
| Já atualizadas | N |
| **Total** | **N** |

#### Resultados Detalhados

Para cada dependência, um bloco:

```
### {package} ({app})
- {current} → {latest}
- Risco: 🟢/🟡/🔴
- Breaking changes: {lista ou "Nenhum"}
- CVEs corrigidos: {lista ou "Nenhum"}
- Performance: {descrição}
- Testes existentes: {sim/não/parcial}
- Recomendação: {texto}
```

#### Plano de Ação

Lista de comandos para atualizar (separado por app):

**apps/momai/ (pnpm)**
```bash
pnpm --filter momai add {package}@{latest}
```

**apps/landing-page/ (pnpm)**
```bash
pnpm --filter landing-page add {package}@{latest}
```

**apps/momai-promo-video/ (pnpm)**
```bash
pnpm --filter momai-promo-video add {package}@{latest}
```

**Root (pnpm)**
```bash
pnpm add -w {package}@{latest}
```

**apps/core/ (Python / uv)**
```bash
cd apps/core && uv add {package}=={latest}
```

**apps/fortscript/ (Python / uv)**
```bash
cd apps/fortscript && uv add {package}=={latest}
```

**Instruções especiais:**
- Se for breaking change que exige migração de código, descreva o que mudar
- Se recomendou NÃO atualizar, anexe a justificativa e sugestão de quando revisar
