# Contribuindo com o MomAI

Obrigado pelo interesse em contribuir com o MomAI!

## Status do Projeto

- **Licença:** Proprietária — todos os direitos reservados. Veja [LICENSE](LICENSE).
- **Não é open source:** Este projeto não é open source. O código é disponibilizado para visualização, mas a licença proprietária se aplica.

## Como Contribuir

### Reportar Bugs

Abra uma [issue](https://github.com/WesleyQDev/MomAI/issues) descrevendo:

- O comportamento esperado vs. observado
- Passos para reproduzir
- Ambiente (sistema operacional, versão do MomAI)

### Propor Melhorias

Abra uma [issue](https://github.com/WesleyQDev/MomAI/issues) com a label `enhancement` descrevendo a melhoria proposta.

### Pull Requests

1. Abra uma issue para discutir a mudança antes de implementar
2. Aguarde o retorno do mantenedor
3. Crie uma branch a partir de `main`
4. Implemente seguindo os padrões do projeto
5. Abra um Pull Request para `main`

## Critérios de Merge

Um Pull Request pode ser mergeado quando atende **todos** os critérios abaixo:

- [ ] CI passa (lint + typecheck + testes)
- [ ] Mantenedor aprovou a mudança
- [ ] Checklist do PR template está completo
- [ ] Código gerado por IA foi revisado por humano
- [ ] Lockfiles atualizados se dependências mudaram
- [ ] Nenhum arquivo `.env` ou `.env.*` incluído

## Regras para Pull Requests

- Siga os padrões de código existentes (veja [AGENTS.md](AGENTS.md) e `.github/copilot-instructions.md`)
- Mantenha o escopo focado em uma única mudança
- Atualize a documentação quando necessário
- Adicione testes quando aplicável
- Use [Conventional Commits](https://www.conventionalcommits.org/) nas mensagens de commit
- Contribuições relacionadas a extensões (skills em `scripts/skills/packaged/`) exigem sincronização com o repositório espelho externo da extensão — veja AGENTS.md para o mapeamento e fluxo

## Contributor License Agreement (CLA)

Ao enviar um Pull Request, você automaticamente concorda com os termos do [CLA.md](CLA.md).

Toda contribuição aceita terá os direitos cedidos ao mantenedor conforme descrito no CLA.

Contribuições sem concordância com o CLA não serão aceitas.

## Segurança

Vulnerabilidades de segurança devem seguir as orientações descritas em [SECURITY.md](SECURITY.md).

Caso o canal oficial ainda não esteja definido, entre em contato com o mantenedor antes de divulgar informações sensíveis publicamente.

## Contribuições com IA

Contribuições geradas ou assistidas por ferramentas de IA (incluindo agentes autônomos como Claude Code, Copilot, etc.) são aceitas desde que:

- O contribuidor humano revise o conteúdo antes de submeter
- O contribuidor assume responsabilidade pelo código gerado
- A origem da contribuição (humana vs. assistida) seja claramente identificada no PR quando relevante

## Código de Conduta

Seja respeitoso. Contribuições com comportamento inadequado não serão aceitas.
