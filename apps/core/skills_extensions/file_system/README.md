# Explorador de Arquivos Inteligente

Esta extensão permite que a MomAI interaja com arquivos locais de forma inteligente através de indexação e busca.

## Funcionalidades
- **Busca por indexação**: Utiliza SQLite + FTS5 para buscar pastas pelo nome ou parte do caminho instantaneamente.
- **Navegação Profunda**: Permite listar conteúdos de diretórios específicos para explorar subpastas.
- **Leitura de Contexto**: Extrai metadados e trechos de arquivos para entender seu conteúdo.
- **Abertura Nativa**: Ferramenta para abrir pastas diretamente no explorador de arquivos do sistema (Windows Explorer, macOS Finder, etc).

## Estratégia de Indexação
O sistema realiza um "primeiro voo" (First Flight) ao iniciar, indexando a pasta do usuário até o nível 4 de profundidade. Pastas como `node_modules`, `.git`, e diretórios de sistema são ignoradas para manter a performance e privacidade.

## Segurança
A leitura de escrita de arquivos é controlada e foca em prover contexto para o usuário sobre seus próprios arquivos.
