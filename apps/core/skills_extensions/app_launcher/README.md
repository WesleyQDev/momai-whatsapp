# App Launcher

Esta extensão permite que a MomAI interaja com seus aplicativos locais, permitindo registrar caminhos de executáveis frequentes e abri-los rapidamente a partir de comandos de voz ou texto.

## Funcionalidades
- **Registro Rápido**: Salve o caminho absoluto de qualquer programa ou jogo, associando um nome fácil para a IA lembrar (ex: "Fortnite").
- **Abertura Inteligente**: Comando inteligente para executar os aplicativos direto na sua máquina (via sistema operacional nativo, seja Windows, Mac ou Linux).
- **Lista Visual**: Solicite "quais apps eu tenho" para visualizar os aplicativos cadastrados e seus respectivos caminhos num formato visual dinâmico.
- **Gerenciamento**: Você pode remover aplicativos que não usa mais facilmente pedindo para a assistente "esquecê-los".

## Onde os dados são salvos?
Apenas localmente! Esta extensão não envia telemetria ou lista seus programas para a internet. Seus executáveis ficam registrados de forma simples num arquivo em `apps/core/data/app_launcher/apps.json`.

## Segurança
Como a ferramenta pode executar arquivos da máquina, o controle é focado em permitir **apenas** a execução de caminhos explicitamente registrados e revisados voluntariamente pelo usuário. 
Aberturas de aplicativos só ocorrem a partir da lista previamente liberada.
