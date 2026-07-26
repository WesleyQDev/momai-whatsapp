# Changelog

Acompanhe todas as atualizações e mudanças da MomAI.

## 1.6.0 - 2026-07-26

### ✨ Novidades

- **Loja de Extensões renovada**: Navegue por cards visuais, filtre por tags e descubra destaques em destaque. Abas separadas para Loja e Instaladas facilitam o gerenciamento. (@WesleyQDev, @AndersonTavares0)
- **Segurança em instalações**: Extensões baixadas agora passam por verificação de integridade e validação contra o catálogo oficial, impedindo a instalação de arquivos adulterados. (@AndersonTavares0)
- **Navegação segura**: O aplicativo agora bloqueia automaticamente redirecionamentos para sites não confiáveis, protegendo contra links maliciosos. (@AndersonTavares0)
- **Verificação de componentes**: Downloads de componentes do sistema agora têm verificação de integridade, garantindo que apenas arquivos originais sejam instalados. (@AndersonTavares0)
- **Editor de Notas estilo Obsidian**: Nova experiência de edição de notas com visualização em tempo real, links entre notas (wiki-style), grafo interativo de conexões e salvamento automático — sua central de conhecimento pessoal integrada à MomAI. (@WesleyQDev)
- **Memória expansível com arquivos .md**: O sistema de memória agora lê arquivos Markdown da pasta `momai/` para enriquecer o conhecimento da IA. Crie prompts personalizados e a assistente absorve o conteúdo automaticamente. (@WesleyQDev)
- **Barra lateral reorganizável**: Ícones de conversas podem ser reordenados com arrastar e soltar, deixando seus chats favoritos sempre no topo. (@WesleyQDev)
- **Limpeza automática de conversas**: Sessões vazias (sem mensagens) são removidas automaticamente da lista, mantendo seu histórico organizado. (@WesleyQDev)
- **Menu da bandeja com status ao vivo**: O menu da bandeja do sistema agora mostra o status do modelo de IA e o tempo restante da soneca em tempo real. (@WesleyQDev)

### ⚙️ Melhorias

- **Modo Chamada mais estável**: Sincronização de conversas melhorada entre a interface e o servidor de voz, eliminando desconexões durante chamadas. (@WesleyQDev)
- **Logs mais legíveis**: Painel de desenvolvimento agora exibe logs organizados e com botões para acessar pastas de diagnóstico. (@WesleyQDev)
- **Motor de IA atualizado**: Parâmetros de inferência ajustados e nova versão do llama.cpp para respostas mais rápidas e precisas. (@WesleyQDev)
- **Carregamento progressivo**: Extensões e componentes agora carregam em etapas, reduzindo o tempo de inicialização. (@WesleyQDev)
- **Comunicação de rede aprimorada**: Novo sistema de streaming para chats mais rápidos e confiáveis. (@WesleyQDev)

### 🐛 Correções

- **Compatibilidade de extensões no Windows**: Restauradas as variáveis de ambiente necessárias para o funcionamento correto de extensões no Windows. (@WesleyQDev)
- **Proteção de arquivos de extensões**: Arquivos usados por extensões agora têm camadas extras de proteção contra acesso indevido a pastas do sistema. (@WesleyQDev)
- **Tela de boas-vindas menos intrusiva**: Notificação sobre privacidade do TTS removida do onboarding inicial. (@WesleyQDev)
- **Progressão de prompts por nível**: Prompts de IA ajustados por nível (Lite/Pro/Ultra) para respostas mais coerentes em cada plano. (@WesleyQDev)
- Correções gerais de estabilidade e desempenho. (@WesleyQDev)

## 1.5.4 - 2026-07-17

### ✨ Novidades

- **Abertura instantânea de Configurações**: A janela de Configurações agora abre imediatamente sem exibir telas de carregamento, graças ao cache local de preferências do usuário.
- **Boot resiliente da interface**: O painel de Configurações e o Gerenciador de Extensões aguardam a inicialização do servidor em segundo plano, eliminando popups de erro durante a inicialização.
- **Desinstalação rápida de Extensões**: A remoção de extensões agora limpa as sessões ativas instantaneamente e fecha o diálogo sem travamentos.

### 🐛 Correções

- **Ajustes sem travamentos**: Alterar o nível de IA ou preferências agora reinicia o modelo em segundo plano, sem travar a interface.
- **Extensões desativadas permanecem desativadas**: Corrigido erro que reativava extensões após recarga do registro.
- **Atualização segura de Extensões**: Workers ativos são encerrados antes de instalar uma nova versão, prevenindo conflitos.
- **Instalação no Windows**: Corrigida detecção do npm no Windows para baixar dependências corretamente.
- **Reconexão automática mais rápida**: Monitor de status agora pesquisa a cada 2 segundos quando o servidor está offline.
- **Barra de progresso sem congelamento**: Corrigido travamento em 90% durante instalação de extensões.
- **Detecção de Extensões**: Extensões instaladas agora são identificadas e listadas corretamente.
- **Notificações instantâneas**: Notificações do WhatsApp aparecem imediatamente após a instalação, sem precisar reiniciar.

## 1.5.3 - 2026-07-13

### 🧹 Outros

- Melhorias internas de performance e estabilidade.

## 1.5.2 - 2026-07-04

### 🔒 Segurança

- **Ícones SVG sanitizados**: Ícones de extensões agora são verificados antes de exibir, prevenindo ataques de segurança. (@AndersonTavares0)
- **Canais de comunicação validados**: A comunicação interna do aplicativo agora passa por validação de segurança. (@AndersonTavares0)
- **Mensagens de erro seguras**: Detalhes de erros são sanitizados para não vazar informações sensíveis. (@AndersonTavares0)
- **Token de sessão protegido**: Sessão do usuário agora é gerenciada de forma mais segura. (@AndersonTavares0)
- **Desinstalação validada**: ID de extensão é verificado antes de remover, prevenindo exclusão acidental. (@AndersonTavares0)

### 🐛 Correções

- **WhatsApp em versões instaladas**: Corrigido funcionamento da extensão WhatsApp em builds empacotadas.
- **Extração de ZIP no Windows**: Múltiplas correções para travamentos ao extrair arquivos no Windows.
- **Instalação de extensões mais rápida**: DNS ignorado em hosts confiáveis para evitar timeouts.
- **Registry de extensões**: Extensões com apenas `manifest.json` agora carregam corretamente.

## 1.5.1 - 2026-06-28

### 🐛 Correções

- **Download de modelos mais confiável**: Implementação de retentativas automáticas e timeouts para garantir downloads robustos de modelos de IA.
- **Correções nas configurações**: Problemas no painel de configurações e carregamento de extensões da comunidade resolvidos.
- **Player do YouTube**: Correções na integração e reprodução de vídeos no chat.

## 1.5.0 - 2026-06-26

### ✨ Novas Funcionalidades

- **Interface de extensões personalizada**: Extensões agora podem ter suas próprias interfaces visuais — telas completas e painéis laterais — integradas de forma nativa ao app.
- **Atalhos de voz por extensão**: Cada extensão pode registrar comandos de voz específicos. Diga "responda" para interagir com uma extensão de mensagens diretamente pelo chat.
- **Priorização inteligente de contexto**: O app ajusta automaticamente quais ferramentas usar conforme o contexto da conversa.
- **Painel de Privacidade**: Visualize todos os dados salvos por cada extensão ativa, com opções de exportação e exclusão.
- **Salvamento automático ao fechar**: Dados das extensões são salvos automaticamente ao fechar o app.
- **Visual atualizado**: Barra lateral e painel de extensões com cores e ícones específicos para cada extensão.
- **Central de Notificações**: Notificações unificadas para todas as extensões ativas.

### 🐛 Correções

- Correções na construção de extensões para compatibilidade com diferentes versões do app.
- Dependências de extensões restauradas.

## 1.4.1 - 2026-05-27

### 🐛 Correções

- **Compatibilidade com pacotes do app**: Corrigida incompatibilidade entre extensões e o formato de pacote do Electron em versões instaladas.
- **Dependências de extensões**: Dependências agora são encontradas corretamente em todas as versões do aplicativo.
- **Instalação resiliente**: Falha em uma dependência opcional não quebra mais a instalação da extensão.
- **QR Code do WhatsApp**: Agora funciona em todas as versões do aplicativo.

## 1.4.0 - 2026-05-10

Integração WhatsApp, Extensões, Modo Economia e Desempenho

### ✨ Novas Funcionalidades

- **WhatsApp**: Integração completa com notificações, comandos de voz ("responda"), cards de chat, envio de mensagens, grupos e contatos.
- **Sistema de Extensões**: Workers persistentes, painel lateral dinâmico e permissões granulares para extensões instaladas.
- **Atalhos de voz para ferramentas**: Comandos como "responda" e "pesquise" ativam ferramentas específicas diretamente pela voz.
- **Modo Economia**: Detecta automaticamente quando você está jogando, pausa a IA para liberar recursos e mostra quanto de memória foi recuperado.
- **Seletor de Voz (TTS)**: Escolha entre voz via nuvem (edge-tts) ou local (kokoro) nas configurações.
- **Ferramentas de Diagnóstico**: Visualize tempos de execução, timelines e filtros para entender o funcionamento interno do app.
- **Motor de IA atualizado**: Versão mais recente do llama.cpp com melhorias de desempenho e estabilidade.

### ⚙️ Melhorias

- **Desempenho geral**: Aplicativo mais rápido e responsivo com otimizações de comunicação e processamento.
- **Transição entre planos mais suave**: Troca de nível de IA com overlay e indicador de progresso.

### 🐛 Correções

- **Modo Chamada**: Estabilidade melhorada na comunicação por voz.
- **Voz (TTS)**: Áudio mais estável e sem travamentos.
- **Lembretes**: Limite de repetições e correção de gatilhos duplicados.
- **Modo Economia**: Detecção de jogos mais precisa (incluindo Fortnite) e toggle persistente.
- **Comunicação entre servidores**: Correções de permissões para APIs de extensões.
- Várias correções de estabilidade e compatibilidade.

## 1.2.0 - 2026-04-22

Estabilidade do Sistema, Melhorias de Áudio e Refinamento de Interface

### ✨ Novas Funcionalidades

- **Voz em Lembretes**: Adicionada opção para ativar respostas por voz em lembretes agendados.
- **Visualizador de Clima melhorado**: Previsão do tempo com emojis e layouts mais ricos.
- **Maior controle sobre configurações de voz**: Gerenciamento avançado de wake word e serviços de transcrição.
- **Políticas de Privacidade atualizadas**: Inclusão de termos sobre rastreamento de localização e uso de dados.

### ⚙️ Melhorias

- **Inicialização mais estável**: Barra de progresso sem oscilações e feedback preciso do estado do servidor.
- **Backend mais robusto**: Tratamento de erros melhorado e logs detalhados durante a inicialização.
- **Compatibilidade Linux**: Melhorias para funcionamento em distribuições Linux.

### 🐛 Correções

- **Texto em negrito no Windows**: Corrigida renderização de markdown em builds de produção.
- **Ícone do app no Windows**: Ícone personalizado agora aparece corretamente no executável.
- **Barra de progresso**: Não reseta mais ao navegar entre abas.
- **Notificações acumuladas**: Lembretes antigos não aparecem mais todos de uma vez ao reiniciar.

## 0.7.0 - 2026-02-26

Refinamento da Interface, Gestão de Lembretes e Melhorias no Instalador de Extensões

### ✨ Novas Funcionalidades

- **Interface de Notas Refinada**: Novo layout estilo abas para visualização de notas, proporcionando uma organização visual mais limpa.
- **Edição Inline de Lembretes**: Facilitada a gestão de lembretes com formulários de edição integrados diretamente na lista.
- **Redirecionamento Inteligente**: O aplicativo agora redireciona automaticamente para a home ao alterar o modo de IA (Lite/Pro/Ultra), garantindo consistência no estado da aplicação.

### ⚙️ Melhorias

- **Instalador de Extensões**: Melhoria na lógica de download do GitHub, com suporte a diretórios aninhados e maior transparência sobre a origem da extensão.
- **Estética Minimalista**: Refinamento dos textos da tela de carregamento e dos cards de planos para uma interface mais limpa e direta.
- **UX de Configurações**: Remoção de confirmações desnecessárias ao reiniciar o processo de boas-vindas.

### 🐛 Correções

- **Scroll do Chat**: Resolvido o problema onde a barra de rolagem do chat ficava travada ou inativa.
- **Botão de Interrupção**: Corrigido bug onde o botão de "Stop" não aparecia consistentemente durante o processamento da IA.
- **Persistência de Extensões**: Melhorada a robustez do instalador para evitar problemas de permissão e garantir que extensões persistam após atualizações.

## 0.6.0 - 2026-02-24

Histórico de Conversas, Agente mais Inteligente e Melhorias no Instalador

### ✨ Novas Funcionalidades

- **Histórico de Conversas**: Nova seção na barra lateral para gerenciar conversas anteriores, com títulos gerados automaticamente pela IA.
- **Agente mais inteligente**: Fluxos de raciocínio avançados que permitem à IA entender melhor suas intenções e usar as ferramentas certas para cada tarefa.
- **Reset de Boas-vindas**: Botão nas configurações para reiniciar o processo de onboarding.

### ⚙️ Melhorias

- **Instalador com um clique**: Configuração do instalador Windows para modo simplificado, reduzindo a fricção no primeiro contato.

### 🐛 Correções

- **Respostas mais precisas**: Corrigido problema onde a IA respondia "não sei" mesmo tendo ferramentas disponíveis para ajudar.

## 0.5.8 - 2026-02-22

Melhorias de Performance, Áudio e Estabilidade

### ✨ Melhorias

- **Pesquisas mais rápidas**: Buscas na internet com menor tempo de resposta.
- **Inicialização mais rápida**: Backend Python carrega em menos tempo.
- **Áudio universal**: Reprodução de som funciona mesmo em sistemas sem bibliotecas de áudio nativas.
- **Lembretes mais rápidos**: Melhor tempo de resposta para lembretes agendados.
- **Desinstalação completa**: O desinstalador agora remove todos os dados residuais para instalações limpas.

### 🐛 Correções

- **Tela de boas-vindas**: Corrigido bug onde ela sumia antes da instalação dos modelos de IA.
- **Onboarding repetitivo**: Tela de boas-vindas não aparece mais em toda inicialização.
- **Estabilidade no Linux**: Melhorias de foco da janela e suporte a sistemas de arquivos somente-leitura (AppImage).

## 0.4.4 - 2026-02-21

### 🐛 Correções

- **Caminho do Core no Linux**: Corrigido bug onde o Electron copiava o core para um diretório temporário, mas ainda passava o caminho original ao iniciar o Python.

## 0.4.2 - 2026-02-21

### 🐛 Correções

- **Áudio mais robusto**: Corrigido erro de biblioteca de áudio ausente em todos os módulos do sistema, permitindo que o app inicie mesmo sem PortAudio instalado.

## 0.4.1 - 2026-02-21

### 🐛 Correções

- **Fallback de áudio**: Adicionada alternativa para tocar áudio quando a biblioteca PortAudio não está disponível, usando o navegador para reprodução.

## 0.4.0 - 2026-02-21

### ⚙️ Melhorias

- **Áudio mais estável e instalação simplificada**: Substituição da biblioteca de áudio por uma versão mais portável que não exige compiladores ou ferramentas de build, tornando a instalação automática muito mais confiável no Windows e Linux.
- **Remoção de dependências obsoletas**: Pacotes não utilizados foram removidos, reduzindo o tamanho do ambiente e evitando conflitos.

## 0.3.6 - 2026-02-21

### 🐛 Correções

- **AppImage Linux**: Corrigido erro crítico onde a instalação de dependências falhava ao tentar escrever em sistema de arquivos somente-leitura. Agora o sistema detecta e copia os arquivos para um diretório temporário.

## 0.3.5 - 2026-02-21

### 🐛 Correções

- **Suporte a Linux**: Corrigido download de binários corretos para Linux (estava baixando versão Windows).
- **Detecção de GPU no Linux**: Corrigida detecção de placas NVIDIA no Linux.
- **Processo órfão no Linux**: Corrigido problema onde o Python ficava rodando mesmo após fechar o app.
- **Mensagens de erro melhores**: Detecção de AppImage e Snap com mensagens específicas.
- **Idioma do sistema**: Agora respeita o idioma configurado no sistema operacional.
- **Pastas de dados corrigidas**: Diretórios de dados agora seguem o padrão do Linux.

## 0.3.4 - 2026-02-21

### 🐛 Correções

- **Ambiente virtual recriado corretamente**: Ao criar um novo ambiente Python, as dependências agora são sempre reinstaladas, evitando conflitos de versão.

## 0.3.3 - 2026-02-21

### 🐛 Correções

- **Falha de inicialização no Linux**: Adicionada dependência ausente que impedia o backend de iniciar.
- **Sincronização forçada**: O app agora atualiza as dependências sempre que uma nova versão é instalada.

## 0.3.1 - 2026-02-21

### ⚙️ Melhorias

- **Versão correta na tela Sobre**: A versão exibida no aplicativo agora reflete a versão real da instalação.

## 0.3.0 - 2026-02-21

Suporte ao Modo Economia em produção

### ⚙️ Melhorias

- **Modo Economia funcionando em versões instaladas**: O monitor de recursos agora funciona corretamente na versão instalada do app.
- **Correção para Linux**: Resolvido erro de inicialização em ambientes Linux (AppImage) ao instalar dependências.

## 0.2.10 - 2026-02-21

### 🐛 Correções

- **Correção crítica no Linux**: Corrigido bug onde o instalador era gerado vazio, resultando em tela de carregamento infinito no Linux.
- **Janela minimizada no Ubuntu/Wayland**: Corrigido problema onde a janela aparecia minimizada no GNOME.

## 0.2.9 - 2026-02-21

### 🐛 Correções

- **Janela invisível no Ubuntu/Wayland**: Resolvido problema onde o app rodava em segundo plano mas a tela não aparecia em máquinas virtuais e Wayland.

## 0.2.7 - 2026-02-21

### ⚙️ Melhorias

- **Dica de ativação por voz**: Mensagem "Tente dizer Luna" agora aparece sempre na tela inicial.

### 🗑️ Remoções

- **Toggle de Wake Word**: Opção de ativar/desativar a palavra de ativação removida das configurações de voz.

## 0.2.5 - 2026-02-21

### ⚙️ Melhorias

- **Detecção de dependências do Windows**: O app agora identifica quando o Visual C++ Redistributable está faltando e fornece o link para instalação, evitando loops de inicialização.

## 0.2.4 - 2026-02-21

### ⚙️ Melhorias

- **Feedback de inicialização**: Barra de progresso e mensagens de status durante a preparação do ambiente Python.

## 0.2.3 - 2026-02-21

### 🐛 Correções

- **Inicialização no Linux**: Corrigido problema onde o aplicativo iniciava minimizado em alguns ambientes Linux (GNOME).

## 0.2.0 - 2026-02-21

Suporte Oficial para Linux

### ✨ Novas Funcionalidades

- **Compatibilidade com Linux**: Suporte nativo para distribuições Linux (AppImage e DEB). O sistema gerencia dependências de áudio de forma transparente, com paridade de recursos com a versão Windows.

### ⚙️ Melhorias

- **Runtime isolado**: Inicialização mais robusta em diferentes distribuições Linux.

## 0.1.3 - 2026-02-21

### 🐛 Correções

- **Falha ao iniciar em contas Windows com espaços no nome**: Corrigido erro crítico onde o bootstrap falhava em computadores cujo nome de usuário continha espaços.

## 0.1.2 - 2026-02-21

### 🐛 Correções

- **Aceleração automática preferia CPU ao invés da GPU**: Corrigido bug onde o modo "Automático" ignorava a GPU do usuário. A detecção de hardware foi aprimorada para identificar GPUs NVIDIA (CUDA), AMD/Intel (Vulkan) e o status exibido agora reflete o backend real.

## 0.1.1 - 2026-02-21

### ✨ Novas Funcionalidades

- **Versão do app na interface**: A versão agora é exibida dinamicamente na tela de boas-vindas e nas configurações.
- **Novo recurso de consulta de versão**: Endpoint dedicado para verificar a versão atual do aplicativo.

### 🐛 Correções

- **Correções no sistema de atualizações**: Corrigido erro no processo de publicação que impedia a criação correta de novas versões.
