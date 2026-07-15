# Roadmap

Visão de longo prazo do MomAI. Decisões grandes, gatilhos, horizontes.
Sem datas fixas — o release train quinzenal define o que sai e quando.

## Agora (v1.14 — v1.18)

- Estabilizar extensões e instalação
- Resolver dívida técnica de segurança e privacidade
- Melhorar feedback de UI (loading, empty, error states)
- CI/CD confiável com testes

## Próximo trimestre (v1.19 — v1.24)

- Memória persistente do assistente
- Extensões com atualização automática
- Painel de privacidade com inventário de dados local
- Melhorias de acessibilidade

## Futuro (sem data — depende de gatilho)

| Projeto | Gatilho para começar |
|---------|----------------------|
| Electron → Tauri | Electron custar 2+ dias de esforço por release |
| App mobile | Versão desktop estável com 80%+ cobertura de testes |
| Loja de extensões | 15+ extensões publicadas por terceiros |

## Decisões arquiteturais pendentes

- **Tauri**: gatilho definido. Enquanto Electron não for gargalo, não mexe.
- **Extensões nativas**: só quando houver demanda de 3+ extensões que precisem de acesso a sistema fora do sandbox atual.

---

Este roadmap é revisado a cada ~3 meses ou quando um gatilho for atingido.
