# Changelog

Acompanhe todas as atualizações e mudanças da MomAI.

## 0.4.3 - 2026-02-21
Correção de Caminhos no Linux (AppImage)

## 🐛 Correções
- **Caminhos de Arquivos no AppImage (Linux):** Corrigido problema onde o aplicativo tentava escrever em caminhos somente-leitura dentro do AppImage. Agora o Electron passa o caminho do core via variável de ambiente `MOMAI_CORE_PATH`, permitindo que o Python use o diretório temporário correto para downloading de modelos ebinários.

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