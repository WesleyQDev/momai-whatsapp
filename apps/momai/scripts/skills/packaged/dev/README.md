# Agente de Código (Extensão)

Esta extensão adiciona capacidades de engenharia de software à MomAI, permitindo a interação direta com o sistema de arquivos do seu projeto através de comandos de linguagem natural.

### Funcionalidades Técnicas:

- **Análise de Arquivos**: Leitura e interpretação de código fonte e arquivos de configuração.
- **Edição via Patch**: Aplicação de alterações contíguas em arquivos existentes com preservação de estrutura.
- **Busca Semântica e Grep**: Localização de padrões, termos ou conceitos em toda a árvore do projeto.
- **Mapeamento de Estrutura**: Visualização e análise da hierarquia de diretórios.

### Protocolo de Segurança:

O agente opera sob um modelo de **confirmação explícita**. Nenhuma operação de escrita ou exclusão é executada sem que o usuário revise e valide o diff (alteração) proposto na interface da MomAI.

### Exemplos de Uso:

- "Analise este arquivo e me diga como a função de autenticação está implementada."
- "Refatore o componente de cabeçalho para usar as novas cores do tema."
- "Onde o banco de dados está sendo inicializado?"
- "Crie uma nova rota na API para listar os usuários."

### Público-alvo:

Desenvolvedores e profissionais técnicos que buscam automatizar tarefas repetitivas de leitura e edição de código.
