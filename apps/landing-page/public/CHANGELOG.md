# Changelog

Acompanhe todas as atualizações e mudanças da MomAI.

## 1.5.1 - 2026-06-28

Melhorias no download de modelos e correções gerais de extensões

### 🐛 Correções

- **Confiabilidade no download de modelos**: Implementação de range requests, tentativas automáticas com backoff linear e timeouts de inatividade para garantir downloads robustos e resilientes de modelos de IA de grande porte.
- **Resolução de bugs nas configurações**: Correção de problemas no painel de configurações e no carregamento dinâmico de extensões da comunidade.
- **Player do YouTube**: Correções e restrições na integração e reprodução do player do YouTube no chat.

## 1.5.0 - 2026-06-26

### ✨ Novas Funcionalidades

- **Interface de extensões personalizada**: Extensões agora podem ter suas próprias interfaces visuais — tanto telas completas quanto painéis laterais — integradas de forma nativa ao app.

- **Atalhos de voz por extensão**: Cada extensão pode registrar comandos de voz específicos. Por exemplo, diga "responda" para interagir com uma extensão de mensagens diretamente pelo chat.

- **Priorização dinâmica de contexto**: O app ajusta automaticamente quais ferramentas e extensões são priorizadas conforme o contexto da conversa.

- **Privacidade transparente**: Painel de Privacidade agora mostra todos os dados salvos por cada extensão ativa, com opções de exportação e exclusão (conformidade LGPD).

- **Salvamento automático ao fechar**: Dados das extensões são salvos automaticamente ao fechar o app para evitar perda de informações.

- **Visual atualizado**: Barra lateral e painel de extensões dinâmicos, com cores e ícones específicos para cada extensão instalada.

- **Notificações unificadas**: Central de notificações integrada para todas as extensões ativas.

### 🐛 Correções

- Correções na construção de extensões para compatibilidade com builds empacotadas.
- Restauração de dependências de runtime que estavam ausentes em extensões.

## 1.4.1 - 2026-05-27

Correções na extensão WhatsApp e no pipeline de dependências

### 🐛 Correções

- **ASAR + cpSync**: Substituído `fs.cpSync` por cópia arquivo-por-arquivo (`readFileSync` + `writeFileSync`) para compatibilidade com Electron ASAR em builds empacotadas (APPX, NSIS)
- **Resolução de dependências**: Adicionado `process.resourcesPath` + `require.resolve` fallback para encontrar deps dentro do ASAR
- **Falha não-fatal**: Instalação de dependências não quebra mais a extensão se um dep opcional falhar
- **Landing page**: Ícones de extensão com filtro `brightness-0 invert` para SVGs externos exibirem branco em fundo colorido
- **.gitignore**: Corrigido conflito da regra `lib/` (Python template) com `apps/landing-page/src/lib/`

### ✨ Melhorias

- **WhatsApp extensão**: QR code funcional em builds APPX, dependências copiadas corretamente (230 pacotes, 8336 arquivos)
- **Deploy landing page**: `git pull --rebase` antes do push para evitar race condition

## 1.4.0 - 2026-05-10

Integração WhatsApp, Extensões, Modo Economia e Desempenho

### ✨ Novas Funcionalidades

- **WhatsApp**: Integração completa via Baileys — overlay de notificações, comandos de voz ("responda"), card de chat, envio de mensagens, grupos e contatos
- **Extensões**: Sistema de extensões com workers persistentes, dependências copiadas do app, NODE_PATH, eventos SSE, permissões granulares, painel lateral dinâmico
- **Keyword Router**: Atalhos de voz para skills — "responda", "pesquise", comandos customizados por extensão
- **Modo Economia**: Detecção automática de jogos (Steam/Epic), pausa do LLM durante jogos, overlay de RAM/VRAM liberados, catálogo com capas
- **TTS Engine Selector**: Escolha entre edge-tts (cloud) e kokoro (local) no onboarding e configurações
- **Observability**: Traços de execução, timeline, filtros, gráficos, persistência em disco
- **Dev Tools**: Painel de desenvolvimento com toggles de logs, observability e context ring
- **llama.cpp b9165**: Atualização massiva (+169 releases) do motor de inferência

### ⚙️ Melhorias

- **Performance**: SQLAlchemy assíncrono, httpx pool, cache TTL de settings, FFT condicional, WebSocket concorrente, SSE backpressure, TTS throttling, pruning de mensagens, consolidação de useReducer
- **Testes**: Suite completa com ~30 arquivos de teste (hooks, componentes, serviços, utilitários)
- **Overlay onboarding**: Transição suave de tier com overlay + loading, polling de status
- **Deploy manual**: Substituída GitHub Pages action por script de deploy direto
- **Regras .gitignore**: Adicionado `worktrees/`, `runtime-data/`

### 🐛 Correções

- **Call mode**: Rollback frontend, sync startup, ws resync, error feedback
- **TTS**: Cleanup de AudioContext, speak handler não-bloqueante
- **Reminders**: Limite de repeat_count, correção de triggers múltiplos
- **Settings cache**: NameError de variável após import
- **Economy**: Race conditions, toggle persistência, cobertura de jogos (Fortnite, Firestone)
- **CORS**: PUT method adicionado para skills keywords API
- **Various**: build, typecheck, lint fixes

## 1.3.0 - 2026-05-02

## 1.2.0 - 2026-04-22

Estabilidade do Sistema, Melhorias de Áudio e Refinamento de Interface

## ✨ Novas Funcionalidades

- **Suporte a Resposta por Voz em Lembretes:** Adicionada opção para ativar respostas por voz (TTS) em lembretes agendados.
- **Melhorias no Visualizador de Clima:** Renderização aprimorada de tabelas de previsão do tempo com suporte a emojis e layouts mais ricos.
- **Gerenciamento de Estado de Voz:** Implementação de rotas de API para controle refinado de wake word e serviços de transcrição.
- **Atualização das Políticas de Privacidade:** Inclusão de termos sobre rastreamento de localização e uso de dados de sensores.

## ⚙️ Melhorias

- **Estabilização do Boot:** Refinamento da sequência de carregamento e da barra de progresso para evitar oscilações visuais e garantir um feedback preciso do estado do backend.
- **Otimização do Startup do Backend:** Melhoria na lógica de inicialização do Python e do servidor llama, com tratamento de erros mais robusto e logging detalhado.
- **Processo de Build Aprimorado:** Adicionado sistema de cache para dependências nos scripts de build e seleção dinâmica de portas para o servidor de inferência.
- **Compatibilidade Linux:** Melhoria no download de wheels e resolução de caminhos de ícones.

## 🐛 Correções

- **Renderização de Markdown:** Corrigido problema onde o texto em negrito não era renderizado corretamente em builds de produção no Windows.
- **Ícones no Windows:** Resolvida a falha que impedia a exibição do ícone personalizado do executável no Windows.
- **Persistência de Estado do Chat:** Corrigido bug onde a barra de progresso resetava ao navegar entre abas.
- **Notificações Acumuladas:** Evitada a exibição de múltiplas notificações de lembretes antigos ao reiniciar o aplicativo.

## 0.7.0 - 2026-02-26

Refinamento da Interface, Gestão de Lembretes e Melhorias no Instalador de Extensões

## ✨ Novas Funcionalidades

- **Interface de Notas Refinada:** Novo layout estilo abas para visualização de notas, proporcionando uma organização visual mais limpa.
- **Edição Inline de Lembretes:** Facilitada a gestão de lembretes com formulários de edição integrados diretamente na lista.
- **Redirecionamento Inteligente:** O aplicativo agora redireciona automaticamente para a home ao alterar o modo de IA (Lite/Pro/Ultra), garantindo consistência no estado da aplicação.

## ⚙️ Melhorias

- **Instalador de Extensões:** Melhoria na lógica de download do GitHub, com suporte a diretórios aninhados e maior transparência sobre a origem da extensão.
- **Estética Minimalista:** Refinamento dos textos da tela de carregamento e dos cards de planos para uma interface mais limpa e direta.
- **UX de Configurações:** Remoção de confirmações desnecessárias ao reiniciar o processo de boas-vindas.

## 🐛 Correções

- **Scroll do Chat:** Resolvido o problema onde a barra de rolagem do chat ficava travada ou inativa.
- **Botão de Interrupção:** Corrigido bug onde o botão de "Stop" não aparecia consistentemente durante o processamento da IA.
- **Persistência de Extensões:** Melhorada a robustez do instalador para evitar problemas de permissão e garantir que extensões persistam após atualizações.

## 0.6.0 - 2026-02-24

Histórico de Conversas, Orquestração Agêntica e Melhorias no Instalador

## ✨ Novas Funcionalidades

- **Histórico de Conversas Dinâmico:** Nova seção na sidebar para gerenciar conversas anteriores, com geração automática de títulos curtos via IA baseada na primeira mensagem.
- **Orquestração Langgraph:** Migração do workflow do agente para uma arquitetura baseada em Langgraph, permitindo fluxos de raciocínio mais complexos e controle fino sobre a execução de ferramentas.
- **Mapeamento de Intenções:** Novo sistema de descoberta de habilidades (Skills) baseado em intenção, garantindo que o agente utilize a ferramenta correta para cada necessidade do usuário.
- **Reset de Boas-vindas:** Adicionado botão nas configurações para reiniciar o processo de onboarding e tela de boas-vindas.

## ⚙️ Melhorias

- **Limites Dinâmicos de Ferramentas:** Implementação de regras de limite de chamadas de ferramentas configuráveis por Skill via metadados.
- **Instalador Silencioso (One-Click):** Configuração do instalador Windows para modo "One-Click", reduzindo a fricção no primeiro contato do usuário com o app.
- **Estabilidade do Backend:** Substituição de blocos de captura de erro genéricos (`except: pass`) por logging informativo em diversos módulos do Core.

## 🐛 Correções

- **Consistência de Respostas:** Melhoria na lógica do Manager Agent para evitar respostas de "não sei" quando há skills relevantes disponíveis.

## 0.5.8 - 2026-02-22

Melhorias de Performance, Áudio e Estabilidade

## ✨ Melhorias

- **Otimização de Pesquisa:** Implementação de buscas assíncronas com `duckduckgo-search` e redução de latência nas ferramentas de pesquisa.
- **Boot do Python mais rápido:** Otimização dos módulos de inicialização, reduzindo significativamente o tempo de carregamento do backend.
- **Fallback de Áudio Universal:** Implementação de playback via Web Audio API no Electron como fallback, garantindo funcionamento do som mesmo em sistemas sem PortAudio.
- **Gestão de Lembretes:** Melhoria na latência da skill de lembretes através da exposição direta de ferramentas ao agente principal.
- **Instalador e Manutenção:** O desinstalador agora realiza uma limpeza profunda de dados residuais (`momai.db`, venv, etc.) para garantir instalações limpas.

## 🐛 Correções

- **Lógica de Boas-vindas:** Corrigido bug onde a tela de boas-vindas sumia antes da conclusão da instalação dos LLMs.
- **Onboarding Repetitivo:** Resolvido o problema onde a tela de onboarding reaparecia em todas as inicializações do aplicativo.
- **Estabilidade no Linux:** Melhoria no foco da janela e tratamento de caminhos em sistemas de arquivos somente-leitura (AppImage).

## 0.4.4 - 2026-02-21

Correção de Caminho do Core no Linux

## 🐛 Correções

- **Caminho do Core não era passado corretamente:** Corrigido bug onde o Electron copiava o core para um diretório temporário gravável, mas ainda passava o caminho original (somente-leitura) ao iniciar o Python. Agora o `MOMAI_CORE_PATH` aponta para o diretório correto.

## 0.4.2 - 2026-02-21

Correção de Fallback de Áudio

## 🐛 Correções

- **Sounddevice não encontrado em todos os módulos:** Corrigido erro `OSError: PortAudio library not found` que ainda ocorria em outros módulos de áudio. Adicionado fallback em `detector.py` e `quick_transcriber.py`, permitindo que o aplicativo inicie normalmente mesmo sem a biblioteca PortAudio instalada.

## 0.4.1 - 2026-02-21

Correção de Dependência de Áudio

## 🐛 Correções

- **Fallback de Áudio para Frontend:** Adicionado fallback para o frontend tocar áudio quando a biblioteca PortAudio não está disponível no sistema. Isso permite que o MomAI inicie normalmente mesmo sem dependências de áudio nativas, utilizando o navegador para reprodução de áudio.

## 0.4.0 - 2026-02-21

Portabilidade de Áudio e Limpeza de Dependências

## ✨ Melhorias

- **Portabilidade de Áudio (Linux e Windows):** Substituição do `pyaudio` pelo `sounddevice` em todo o núcleo (Core). O `sounddevice` utiliza `CFFI`, o que elimina a necessidade de compiladores (`gcc`) ou ferramentas de build na máquina do usuário, tornando a instalação automática do ambiente Python muito mais confiável.
- **Remoção de Dependências Obsoletas:** Removidos pacotes como `pvporcupine`, `pygetwindow` e `pyrect` que não eram mais utilizados, reduzindo o tamanho do ambiente e evitando conflitos de instalação.

## 0.3.6 - 2026-02-21

Correção Crítica - AppImage Read-Only File System

## 🐛 Correções

- **Fix Read-Only File System no AppImage:** Corrigido problema crítico onde a instalação de dependências falhava com "Read-only file system" ao tentar criar `core.egg-info`. Agora o sistema detecta automaticamente quando o diretório do core é somente-leitura e copia os arquivos para um diretório temporário antes de instalar.

## 0.3.5 - 2026-02-21

Correções e Melhorias de Compatibilidade Linux

## 🐛 Correções

- **Suporte a Binários Linux para Llama.cpp:** Corrigido problema crítico onde o downloader tentava baixar binários Windows no Linux. Agora o sistema detecta corretamente o sistema operacional e baixa os binários apropriados (Ubuntu x64 CPU/Vulkan).
- **Detecção de Hardware GPU no Linux:** Corrigida a detecção de GPUs NVIDIA no Linux para usar Vulkan como backend (não há binário CUDA oficial para Linux/Ubuntu no llama.cpp).
- **Monitor de Processo Pai no Linux:** Corrigido problema onde o processo Python ficava órfão quando o Electron crashava no Linux. Agora o `monitor_parent()` funciona em todas as plataformas.
- **Mensagem de Erro Read-Only Melhorada:** Adicionada detecção de AppImage e Snap com mensagens de erro específicas quando o filesystem é somente-leitura.
- **Locale do Sistema:** Removido locale hardcoded `pt_BR.UTF-8` que poderia falhar em sistemas sem essa locale. Agora usa a locale do sistema ou `C.UTF-8` como fallback.
- **Caminhos XDG Corrigidos:** Corrigido o script de diagnóstico `diagnostic.sh` para usar `XDG_DATA_HOME` (consistent com Electron) em vez de `XDG_CONFIG_HOME` para venv e logs.

## 0.3.4 - 2026-02-21

Correção de Bug Crítico de Setup

## 🐛 Correções

- **Ambiente Virtual Recriado Ignorado:** Corrigido bug onde a criação de um novo ambiente virtual não invalidava o SyncLock, causando salto da instalação de dependências. Agora, ao criar um novo venv, o lock é invalidado para garantir que as dependências sejam sempre instaladas.

## 0.3.3 - 2026-02-21

Correções Críticas de Setup e Dependências

## 🐛 Correções

- **Falha de Inicialização (python-dotenv):** Adicionada a dependência missing `python-dotenv` ao core, corrigindo o erro `ModuleNotFoundError: No module named 'dotenv'` que impedia o boot do backend no Linux.
- **Sincronização Forçada de Ambiente:** Melhorada a lógica do `SyncLock` para detectar mudanças de versão do aplicativo. Agora o MomAI forçará a atualização das dependências sempre que uma nova versão for instalada, evitando que o bootstrap pule atualizações cruciais.

## 0.3.1 - 2026-02-21

Melhorias na Interface e Versionamento

## ✨ Melhorias

- **Versionamento Dinâmico:** A versão exibida na janela "Sobre" (TitleBar) agora é carregada dinamicamente das configurações do aplicativo, garantindo que sempre reflita a versão real da release.

## 0.3.0 - 2026-02-21

Suporte ao FortScript no build de produção

## ✨ Melhorias

- **Modo Economia (FortScript) em Produção:** Corrigido problema onde o monitor de recursos (FortScript) não funcionava na versão instalada. A pasta `fortscript` agora é incluída corretamente no pacote e as dependências necessárias foram adicionadas ao ambiente virtual do core.
- **Correção de "Read-only file system" no Linux:** Resolvido o erro de bootstrap que impedia o MomAI de iniciar em ambientes Linux (AppImage) ao tentar rodar `pip install -e`. Agora o sistema identifica as dependências e as instala diretamente, evitando tentativas de escrita na partição montada do AppImage.

## 0.2.10 - 2026-02-21

Correção crítica de instalação no Linux e Melhorias de Renderização

## 🐛 Correções

- **Carregamento Infinito (uv_not_found) no Linux:** Corrigido bug crítico no script de build onde os binários essenciais (`uv` e `python`) eram colocados na pasta incorreta durante a geração do AppImage e pacote DEB. Isso fazia com que o instalador fosse gerado vazio, resultando em uma tela de carregamento que não exibia a interface de erro e ficava em loop infinito no ambiente Linux.
- **Janela Minimizada no Ubuntu/Wayland:** Adicionado delay de tempo de recuperação e a chamada obrigatória `win.moveTop()` no Linux para contornar comportamento de sistemas operacionais onde a janela mesmo com bounds ativados poderia ficar retida em estado recuado na barra superior do GNOME.

## 0.2.9 - 2026-02-21

Correções de renderização da janela no Linux (Wayland)

## 🐛 Correções

- **Janela Invisível no Ubuntu/Wayland e VMs:** Resolvido o problema onde o aplicativo rodava em segundo plano mas a interface gráfica não aparecia em máquinas virtuais (Hyper-V, VirtualBox) e Wayland. A aceleração de hardware do Electron foi desativada nativamente no Linux para evitar falhas silenciosas de renderização de GPU que ocultavam a janela. Além disso, a janela agora utiliza `setBounds` com cálculo das margens úteis da tela para simular maximização de forma segura.

## 0.2.7 - 2026-02-21

Correção da hint de voice activation

## ✨ Melhorias

- **Hint de Ativação por Voz:** Corrigido bug onde a mensagem "Tente dizer Luna" nem sempre aparecia na interface inicial. Agora a hint é exibida sempre, independentemente de qualquer configuração.

## 🗑️ Remoções

- **Toggle de Wake Word nas Configurações:** Removida a opção de ativar/desativar a wake word das configurações de voz.

## 0.2.5 - 2026-02-21

Correções de Inicialização (DLL failure)

## ✨ Melhorias

- **Detecção de Dependências do Windows:** Adicionada detecção específica para o erro "Uma rotina de inicialização da biblioteca de vínculo dinâmico (DLL) falhou" (comum no NumPy/Torch). O aplicativo agora identifica automaticamente quando o Microsoft Visual C++ Redistributable está faltando e fornece o link direto para instalação, evitando loops de reinicialização.

## 0.2.4 - 2026-02-21

Melhorias Visuais e de Inicialização

## ✨ Melhorias

- **Feedback de Inicialização:** Adicionada barra de progresso e mensagens de status detalhadas durante o bootstrap do ambiente Python.

## 0.2.3 - 2026-02-21

Correções de Janela no Linux

## Correções

- **Inicialização no Ubuntu/Linux:** Corrigido problema onde o aplicativo iniciava minimizado em alguns ambientes Linux (como GNOME). Adicionada lógica de foco explícito e um pequeno delay na maximização para garantir que o Gerenciador de Janelas processe a exibição corretamente.

## 0.2.2 - 2026-02-21

Correções e Estabilidade

## Correções de Infraestrutura

- **Colisão de Artefatos no GitHub Release:** Corrigido o erro que causava falha na etapa final do pipeline de publicação por tentar fazer o upload de dois arquivos `builder-debug.yml` idênticos (gerados pelos builds de Windows e Linux) simultaneamente para o mesmo Release. Evitando o erro `HTTP 422: Validation Failed`.

## 0.2.1 - 2026-02-21

Correções e Estabilidade

## Correções de Infraestrutura

- **Rotina de Build CI Linux:** Removida dependência obsoleta (`libgconf-2-4`) do pipeline de integração contínua. Essa mudança garante suporte total a compilações nativas de pacotes linux rodando nas imagens atualizadas e imutáveis `ubuntu-24.04` do GitHub.

## 0.2.0 - 2026-02-21

Suporte Oficial para Linux

## Novas Funcionalidades

- **Compatibilidade com Linux (AppImage & DEB):** Implementação de suporte nativo para distribuições Linux. O sistema agora realiza o bootstrap automatizado do ambiente Python e gerencia dependências de áudio (PortAudio/ALSA) de forma transparente, garantindo paridade de recursos com a versão Windows.
- **Distribuição Inteligente Segura:** O portal oficial implementa agora lógica de detecção de SO via User-Agent para fornecer automaticamente o binário mais adequado (AppImage/deb/exe), otimizando o fluxo de aquisição para novos usuários.

## Melhorias de Infraestrutura

- **Build Engine Unificado:** Reestruturação do pipeline de CI/CD (GitHub Actions) para suportar compilação paralela multi-arch. Isso garante que todas as futuras atualizações sejam entregues simultaneamente para Windows e Linux com integridade verificada.
- **Ambiente de Runtime Isolado:** Refinamento dos scripts de inicialização para garantir permissões de execução corretas em ambientes POSIX, aumentando a robustez do software em diferentes distribuições.

---

## 0.1.3 - 2026-02-21

Correção de compatibilidade com usernames do Windows que contêm espaços.

## 🐛 Correções

- **Falha ao iniciar em contas Windows com espaços no nome:** Corrigido erro crítico onde o bootstrap do ambiente Python falhava em computadores cujo nome de usuário do Windows continha espaços (ex: "Central de Veiculos"). O processo `uv` recebia o caminho partido pelo `cmd.exe`, resultando no erro `'C:\Users\Nome' não é reconhecido como um comando interno`.

---

## 0.1.2 - 2026-02-21

Correções no sistema de aceleração por hardware.

## 🐛 Correções

- **Aceleração automática preferia CPU ao invés da GPU:** Corrigido bug onde o modo "Automático" nas configurações de aceleração ignorava a GPU do usuário e utilizava CPU. A detecção de hardware foi aprimorada para identificar corretamente GPUs NVIDIA (CUDA), AMD/Intel (Vulkan) mesmo quando nenhum engine estava instalado, e o status exibido nas configurações agora reflete o backend real sendo utilizado.

---

## 0.1.1 - 2026-02-21

Essa versão engloba todas as novidades preparadas para a v0.1.0, junto com correções críticas no sistema de atualizações!

## 🚀 Novas Funcionalidades

- **Versionamento dinâmico na interface:** A versão do aplicativo agora é exibida dinamicamente na tela de onboarding inicial e no painel de configurações, sempre refletindo a versão atual da release.
- **Novo endpoint de versão:** Adicionado endpoint dedicado para consulta da versão atual da aplicação.

## ⚙️ Melhorias

- **Sincronização automática de versão no CI/CD:** O pipeline de integração contínua agora atualiza automaticamente a versão no `package.json` ao publicar uma tag de release, eliminando a necessidade de atualização manual a cada novo lançamento.

## 🐛 Correções

- **Falha no pipeline de release:** Corrigido erro no workflow de publicação automática que impedia a criação correta da release v0.1.0.
