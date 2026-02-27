# Padrões de desenvolvimento da MomAI
- **Gerenciador de pacotes node** Sempre utilize pnpm ao inves do npm.
- **Gerenciador de hambientes Python** Sempre prefira usar uv
- **Clean code** Prefira poucos comentarios no código e nunca em português.

## Frontend
Sempre que criar uma nova funcionalidade lembre-se de criar no tema dark e light atuais da MomAI

## Backend
Lembrese a MomAI possui 3 modos, (Lite, pro e ultra) cada um possui suas limitações.

## Engenharia de software
Ao escrever ou revisar código, sempre siga:
- SOLID, DRY, KISS e YAGNI
- Design patterns apropriados ao contexto (ex: Factory, Strategy, Repository)
- Código limpo: nomes descritivos, funções pequenas e com responsabilidade única
- Tratamento de erros e edge cases
- Separação de responsabilidades e baixo acoplamento
- Explique brevemente as decisões de design quando relevante.