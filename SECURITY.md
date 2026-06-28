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
