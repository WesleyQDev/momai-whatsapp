# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.5.x | ✅ |
| versões anteriores | sob consulta |

## Reporting a Vulnerability

Vulnerabilidades de segurança não devem ser divulgadas publicamente de imediato.

**Canal oficial:** reportes devem ser enviados via [GitHub Security Advisories](https://github.com/WesleyQDev/momai/security/advisories/new) no repositório privado. Alternativamente, e-mail para o mantenedor.

Inclua no reporte:
- Descrição da vulnerabilidade
- Passos para reproduzir
- Versão afetada
- Impacto potencial
- Sugestão de mitigação (se houver)

## Response Process

| Severidade | Reconhecimento inicial | Triagem | Correção |
|---|---|---|---|
| Crítica | 24h | 72h | 7 dias |
| Alta | 72h | 7 dias | 14 dias |
| Média | 7 dias | 14 dias | 30 dias |
| Baixa | 14 dias | 30 dias | Próximo ciclo |

Reportes serão analisados pelo mantenedor. O reporter receberá atualização a cada fase.

## Disclosure Policy

Divulgação coordenada (coordinated disclosure):

1. Reporter envia vulnerabilidade via canal oficial
2. Mantenedor confirma recebimento dentro do prazo de reconhecimento
3. Mantenedor investiga, desenvolve correção
4. Correção é publicada como release
5. Advisory público é publicado 30 dias após a correção, ou antes se coordenado com o reporter

Divulgação pública antes da correção **não é permitida** e pode expor usuários.

## Safe Harbor

Pesquisadores de segurança que seguirem esta política de divulgação coordenada não serão alvo de ações legais relacionadas à pesquisa de boa-fé. Consideramos atividades de boa-fé:

- Testes realizados em ambiente próprio ou com autorização explícita
- Divulgação coordenada seguindo os prazos desta política
- Não exploração da vulnerabilidade além do necessário para demonstração
- Não acesso, alteração ou destruição de dados de usuários

Atividades fora deste escopo não são cobertas por safe harbor.

## Vulnerability Remediation SLA

| Severidade | Exemplos | Prazo máximo | Bloqueia release? |
|---|---|---|---|
| Crítica | RCE, privilege escalation, data exfiltration | 7 dias | Sim |
| Alta | Auth bypass, XSS explorável, spoofing de mensagens | 14 dias | Sim |
| Média | DoS, information disclosure limitada, ReDoS | 30 dias | Não |
| Baixa | Hardening, defense-in-depth, theoretical | Próximo ciclo | Não |

### Exception / Risk Acceptance Process

Quando uma vulnerabilidade não pode ser corrigida dentro do SLA:

1. **Registro:** documentar em issue com label `risk-accepted`
2. **Campos obrigatórios:**
   - ID do advisory (GHSA/CVE)
   - Pacote afetado e versão
   - Severidade
   - Componente/feature impactado
   - Justificativa técnica para o aceite
   - Mitigação compensatória aplicada
   - Owner responsável
   - Data de revisão (máximo 90 dias)
3. **Aprovação:** requer review do mantenedor
4. **Revisão periódica:** todo aceite de risco expira em no máximo 90 dias e deve ser revalidado

## Scope

### In Scope

- Aplicação principal MomAI
- Electron (main + preload + renderer)
- React frontend
- Backend Python (FastAPI)
- Node Core (scripts/node-core)
- Scripts de build e CI/CD
- Extensões oficiais
- Dependências runtime de todos os componentes acima (Node, Python)

### Out of Scope

- Landing page
- Serviços externos não mantidos pelo projeto
- Dependências exclusivamente de desenvolvimento sem impacto em produção

## Accepted Risks

The following vulnerabilities are documented exceptions tracked via the project's risk acceptance process.
Each entry includes the rationale, mitigation, and expiration date.
These will be reviewed on or before their expiration date.

### AR-01: undici (4 CVEs — CVE-2026-9697, CVE-2026-12151, CVE-2026-6734)
- **Package:** undici@6.25.0 / undici@7.25.0
- **Source:** `electron@42.5.0 > @electron/get > undici` (build-only, downloads Electron binaries)
- **Impact:** Build-time only. No runtime exposure in the MomAI application.
- **Mitigation:** CI runs on isolated runners. Binaries downloaded from official GitHub releases.
- **Fix plan:** Electron upstream must update `@electron/get` to bundle a patched undici version.
- **Owner:** @WesleyQDev
- **Expiration:** 2026-12-28
- **Removal condition:** Electron >=42.x resolves undici to >=7.28.0

### AR-02: music-metadata (CVE-2026-32256 — infinite loop in ASF parser)
- **Package:** music-metadata@7.14.0
- **Source:** `@whiskeysockets/baileys@6.17.16 > music-metadata@^7.12.3`
- **Impact:** Runtime — WhatsApp extension audio processing. Low exploitability (requires malicious ASF file received via chat).
- **Mitigation:** Baileys 7.0.0-rc13 already depends on `music-metadata@^11.12.3` (patched). Upgrade to stable baileys 7.x when released.
- **Fix plan:** Monitor baileys releases for stable v7. Override directly only after API compatibility validated.
- **Owner:** @WesleyQDev
- **Expiration:** 2026-09-28
- **Removal condition:** `@whiskeysockets/baileys` >=7.0.0 stable, or override validated as safe

### AR-03: electron-builder ecosystem — tar v6 (6 CVEs — RESOLVED as of 2026-06-28)
- **Status:** ✅ Resolved via `overrides.tar >=7.5.11` in `pnpm-workspace.yaml`
- **Note:** This override forces tar@7.x for the entire dependency graph. Electron-builder ecosystem compatibility validated.
- **Risk of regression:** Low. If electron-builder releases a version incompatible with tar@7.x, this override may need revisiting.
