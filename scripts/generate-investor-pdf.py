from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit
from reportlab.platypus import Table, TableStyle
import os

W, H = A4
MARGIN = 60
BODY_W = W - 2 * MARGIN
BOTTOM_LIMIT = 70

DARK = HexColor('#1a1a1a')
GRAY = HexColor('#444444')
LIGHT_GRAY = HexColor('#666666')
TABLE_HDR = HexColor('#2c3e50')
TABLE_ALT = HexColor('#f8f9fa')

OUTPUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'MomAI-Whitepaper.pdf')
c = canvas.Canvas(OUTPUT, pagesize=A4)
PAGE = [1]

def pnum():
    return PAGE[0]

def new_page():
    c.showPage()
    PAGE[0] += 1
    c.setFont('Helvetica', 8)
    c.setFillColor(LIGHT_GRAY)
    c.drawCentredString(W / 2, 25, str(PAGE[0]))
    c.setStrokeColor(HexColor('#dddddd'))
    c.setLineWidth(0.5)
    c.line(MARGIN, 35, W - MARGIN, 35)

def check(y, needed=60):
    if y - needed < BOTTOM_LIMIT:
        new_page()
        return H - 55
    return y

def para(text, y, size=10, leading=14):
    c.setFont('Helvetica', size)
    c.setFillColor(GRAY)
    lines = simpleSplit(text, 'Helvetica', size, BODY_W)
    for i, line in enumerate(lines):
        c.drawString(MARGIN, y - i * leading, line)
    return y - len(lines) * leading

def para_small(text, y, size=9, leading=13):
    c.setFont('Helvetica', size)
    c.setFillColor(LIGHT_GRAY)
    lines = simpleSplit(text, 'Helvetica', size, BODY_W)
    for i, line in enumerate(lines):
        c.drawString(MARGIN, y - i * leading, line)
    return y - len(lines) * leading

def sect(num, title, y):
    y = check(y, 50)
    c.setFont('Helvetica-Bold', 16)
    c.setFillColor(DARK)
    text = f'{num}. {title}' if num else title
    c.drawString(MARGIN, y, text)
    c.setStrokeColor(DARK)
    c.setLineWidth(1)
    c.line(MARGIN, y - 4, W - MARGIN, y - 4)
    return y - 28

def subsect(num, title, y):
    y = check(y, 40)
    c.setFont('Helvetica-Bold', 12)
    c.setFillColor(DARK)
    c.drawString(MARGIN, y, f'{num} {title}')
    return y - 22

def subsub(title, y):
    y = check(y, 35)
    c.setFont('Helvetica-Bold', 10)
    c.setFillColor(DARK)
    c.drawString(MARGIN, y, title)
    return y - 18

def bullet(text, y, indent=15, size=10, leading=14):
    y = check(y, leading + 5)
    c.setFont('Helvetica', size)
    c.setFillColor(GRAY)
    lines = simpleSplit(text, 'Helvetica', size, BODY_W - indent)
    c.drawString(MARGIN + 3, y, '\u2022')
    for i, line in enumerate(lines):
        c.drawString(MARGIN + indent, y - i * leading, line)
    return y - len(lines) * leading

def sp(y, amt=14):
    return y - amt

def draw_table(t, y):
    tw, th = t.wrap(0, 0)
    if y - th < BOTTOM_LIMIT:
        new_page()
        y = H - 55
    t.drawOn(c, MARGIN, y - th)
    return y - th - 5

# ═══════════════════════════════════════════════════════════════════
# PAGE 1: TITLE PAGE
# ═══════════════════════════════════════════════════════════════════
c.setFillColor(DARK)
c.setFont('Helvetica-Bold', 28)
c.drawCentredString(W / 2, H - 160, 'MomAI')
c.setFont('Helvetica', 18)
c.setFillColor(GRAY)
c.drawCentredString(W / 2, H - 190, 'Um Sistema Cognitivo Local com')
c.drawCentredString(W / 2, H - 212, 'Arquitetura Orientada a Eventos')

c.setStrokeColor(HexColor('#cccccc'))
c.setLineWidth(0.5)
c.line(MARGIN + 60, H - 250, W - MARGIN - 60, H - 250)

c.setFont('Helvetica', 11)
c.setFillColor(LIGHT_GRAY)
c.drawCentredString(W / 2, H - 275, 'Whitepaper Tecnico')

c.setFont('Helvetica', 10)
c.setFillColor(LIGHT_GRAY)
c.drawCentredString(W / 2, H - 310, 'Autor: github.com/WesleyQDev')
c.drawCentredString(W / 2, H - 328, 'Versao: Maio de 2026')

c.setFont('Helvetica', 9)
c.setFillColor(LIGHT_GRAY)
c.drawCentredString(W / 2, H - 370, 'Open Source  |  MIT License')

c.setStrokeColor(HexColor('#cccccc'))
c.setLineWidth(0.5)
c.line(MARGIN + 30, H - 395, W - MARGIN - 30, H - 395)

c.setFont('Helvetica-Oblique', 9)
c.setFillColor(HexColor('#888888'))
abstract = (
    'Este documento descreve a arquitetura do MomAI, um assistente virtual local-first que '
    'combina modelos de linguagem de grande escala (LLMs) com acoes reais no computador do usuario. '
    'Apresenta-se o estado atual do sistema, sua arquitetura em tres componentes principais '
    '(Desktop, Node Core, Python Sidecar), o ecossistema de skills e extensoes, e a nova '
    'arquitetura MomAI Events para operacao autonoma orientada a eventos. O sistema opera '
    '100% local, sem dependencia de nuvem, utilizando llama.cpp com aceleracao Vulkan para '
    'inferencia e LanceDB para memoria vetorial.'
)
y = para_small(abstract, H - 420, size=9, leading=13)

new_page()

# ═══════════════════════════════════════════════════════════════════
# PAGE 2: SUMARIO
# ═══════════════════════════════════════════════════════════════════
y = H - 50
c.setFont('Helvetica-Bold', 18)
c.setFillColor(DARK)
c.drawString(MARGIN, y, 'Sumario')
y -= 30

toc = [
    ('1  Introducao', False),
    ('2  Arquitetura Atual', False),
    ('    2.1  Desktop App (Electron + React + TypeScript)', True),
    ('    2.2  Node Core (Node.js)', True),
    ('    2.3  Python Sidecar (FastAPI)', True),
    ('    2.4  Comunicacao entre Componentes', True),
    ('3  Ecossistema de Skills e Extensoes', False),
    ('    3.1  Skills Core', True),
    ('    3.2  Extensoes da Comunidade', True),
    ('    3.3  Skill Discovery', True),
    ('4  Pipeline de Voz', False),
    ('5  MomAI Events: Nova Arquitetura', False),
    ('    5.1  Tres Pilares Fundamentais', True),
    ('    5.2  Arquitetura em Tres Camadas', True),
    ('    5.3  Modulos e Manifestos', True),
    ('    5.4  O Ciclo Cognitivo em 6 Etapas', True),
    ('    5.5  Politicas Ativas', True),
    ('    5.6  Triggers e Auto-Agendamento', True),
    ('    5.7  Auto-Modificacao de Modulos', True),
    ('6  Integracao Hibrida', False),
    ('7  Roteiro de Desenvolvimento', False),
    ('8  Conclusao', False),
]
for item, is_sub in toc:
    c.setFont('Helvetica', 10) if is_sub else c.setFont('Helvetica-Bold', 10)
    c.setFillColor(GRAY if is_sub else DARK)
    x = MARGIN + 15 if is_sub else MARGIN
    c.drawString(x, y, item.strip())
    y -= 16

new_page()

# ═══════════════════════════════════════════════════════════════════
# PAGE 3: INTRODUCAO
# ═══════════════════════════════════════════════════════════════════
y = H - 50
y = sect('1', 'Introducao', y)

y = para(
    'Assistentes virtuais tradicionais operam como caixas-pretas na nuvem: o usuario envia um comando, '
    'o dado viaja para servidores remotos, onde e processado por modelos proprietarios, e a resposta '
    'retorna para o dispositivo. Esse modelo apresenta limitacoes fundamentais: dependencia de conexao '
    'de internet, custos recorrentes por uso, latencia elevada (500-2000ms), e -- mais critico -- '
    'ausencia de privacidade, ja que os dados do usuario sao processados e frequentemente armazenados '
    'por terceiros.', y)

y = sp(y)

y = para(
    'A MomAI propoe uma alternativa radical: todo o processamento -- inferencia do modelo de linguagem, '
    'armazenamento de memoria, reconhecimento de voz, sintese de fala, e execucao de acoes -- acontece '
    'exclusivamente na maquina do usuario. O sistema utiliza llama.cpp com aceleracao Vulkan para '
    'inferencia local de LLMs, LanceDB para memoria vetorial, e uma arquitetura de modulos intermediarios '
    'que isolam o LLM do hardware fisico.', y)

y = sp(y)

y = para(
    'Este documento esta organizado em duas grandes secoes. As secoes 2 a 4 descrevem a arquitetura atual '
    'da MomAI, ja implementada e funcional. A secao 5 apresenta a nova arquitetura MomAI Events, '
    'atualmente em fase de projeto, que estende o sistema para operacao autonoma orientada a eventos. '
    'A secao 6 discute a integracao entre os dois paradigmas.', y)


# ═══════════════════════════════════════════════════════════════════
# ARQUITETURA ATUAL
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('2', 'Arquitetura Atual', y)

y = para(
    'A MomAI atual e composta por tres processos independentes que se comunicam via HTTP, WebSocket '
    'e IPC (Inter-Process Communication). Cada processo tem responsabilidades bem definidas e pode '
    'ser atualizado ou substituido sem impacto sobre os demais.', y)

y = sp(y)
y = subsect('2.1', 'Desktop App (Electron + React + TypeScript)', y)

y = para(
    'A interface grafica do usuario e construida com Electron 39, React 19 e TypeScript 5.9, '
    'utilizando TailwindCSS 3 para estilizacao. O frontend se comunica com o Node Core via HTTP '
    'REST para operacoes de chat (streaming SSE), WebSocket para eventos em tempo real, e IPC '
    'para comunicacao direta com o processo principal do Electron.', y)

y = sp(y)

y = para(
    'Funcionalidades da interface: (a) chat com streaming de tokens, respostas estruturadas e '
    'renderizacao de componentes visuais; (b) modo voz com visualizacao em tempo real do audio; '
    '(c) loja de extensoes para instalacao de modulos da comunidade; (d) central de configuracoes; '
    '(e) visualizacao de estado do sistema, uso de recursos e historico.', y)

y = sp(y)
y = subsect('2.2', 'Node Core (Node.js)', y)

y = para(
    'O Node Core e o orquestrador principal do sistema. Escrito em Node.js, ele gerencia todo o '
    'fluxo de processamento: desde o recebimento da mensagem do usuario ate a execucao de skills '
    'e o streaming da resposta. Seus principais subsistemas sao descritos a seguir.', y)

y = sp(y)
y = subsub('Gerenciamento de LLM (llama-manager.js)', y)
y = para(
    'Gerencia o ciclo de vida completo do llama-server: inicializacao do processo, selecao do backend '
    'de GPU (Vulkan, CUDA ou CPU), download automatico de modelos GGUF do HuggingFace, e fallback '
    'entre portas em caso de conflito. O sistema suporta tres tiers de modelo: Lite (Qwen3.5-0.8B, '
    'contexto 8192), Pro (Qwen3.5-2B, contexto 8192) e Ultra (Qwen3.5-4B, contexto 8192 com '
    'embeddings para busca semantica). A comunicacao com o llama-server ocorre via API REST '
    'compativel com o formato OpenAI Chat Completions.', y)

y = sp(y)
y = subsub('Memoria Semantica (semantic-engine.js + LanceDB)', y)
y = para(
    'O sistema mantem um banco vetorial local utilizando LanceDB para recuperacao de contexto entre '
    'sessoes. Quando o usuario faz uma pergunta, o sistema executa uma busca vetorial nas notas e '
    'memorias armazenadas, combinada com busca lexical como fallback. Os resultados sao injetados '
    'no prompt do LLM como contexto de memoria, permitindo continuidade entre conversas.', y)

y = sp(y)
y = subsub('Orquestracao de Chat (chat-service.js)', y)
y = para(
    'O fluxo de processamento de uma mensagem segue estas etapas: (1) recebimento da mensagem do '
    'usuario via SSE; (2) recuperacao de memoria semantica relevante; (3) descoberta das top-5 '
    'skills mais relevantes por similaridade semantica; (4) conversao das skills em definicoes de '
    'tools no formato OpenAI; (5) envio do prompt completo para o LLM; (6) decodificacao da resposta '
    'entre texto direto ou chamada de tool; (7) execucao da skill e retorno do resultado ao LLM '
    'para processamento adicional (ate 3 rodadas no tier Ultra); (8) streaming da resposta final '
    'via SSE.', y)

# Page break likely needed here
y = check(y, 100)

y = subsub('Skill Discovery (keyword-router.js + semantic-engine)', y)
y = para(
    'O sistema descobre automaticamente qual skill ativar baseado na intencao do usuario, sem '
    'necessidade de configuracao manual. No tier Ultra, utiliza busca semantica no LanceDB sobre '
    'nomes, descricoes e tools das skills. Como fallback, utiliza correspondencia lexical por '
    'palavras-chave. As top-5 skills sao convertidas em ferramentas disponiveis para o LLM no '
    'formato de function-calling.', y)

y = sp(y)
y = subsub('Persistencia Local (store.js)', y)
y = para(
    'Todas as configuracoes, threads de conversa, lembretes e preferencias do usuario sao armazenadas '
    'em arquivos JSON no sistema de arquivos local. Nao ha dependencia de banco de dados externo '
    'ou servico de nuvem. O sistema nao coleta telemetria nem envia dados para servidores remotos.', y)

y = sp(y)
y = subsub('Streaming e Comunicacao (websocket.js)', y)
y = para(
    'O Node Core mantem um servidor WebSocket para comunicacao em tempo real com o frontend. '
    'Os eventos transmitidos incluem: progresso de inicializacao, inicio e fim de sintese de voz, '
    'uso de recursos do sistema, lembretes disparados, e traces de observabilidade. '
    'O WebSocket tambem faz ponte com o Python Sidecar para eventos de voz.', y)

y = sp(y, 20)
y = subsect('2.3', 'Python Sidecar (FastAPI)', y)

y = para(
    'O Python Sidecar e um servico FastAPI responsavel exclusivamente pelo processamento de audio. '
    'Ele executa em processo separado (porta 8001) e se comunica com o Node Core via HTTP e '
    'WebSocket. Suas responsabilidades incluem:', y)

y = bullet('Deteccao de palavra de ativacao (wake word): utiliza modelos ctranslate2/faster-whisper para detectar as palavras "Luna" ou "Computador" no audio.', y)
y = bullet('Transcricao de fala (STT): utiliza Whisper para converter audio em texto.', y)
y = bullet('Sintese de fala (TTS): utiliza Kokoro como mecanismo primario e Edge TTS como fallback, com pre-aquecimento para reducao de latencia.', y)
y = bullet('Call mode: modo maos-livres com transcricao continua e resposta por voz, sem palavra de ativacao.', y)
y = bullet('Deteccao de resposta no WhatsApp: identificacao de mensagens de audio recebidas.', y)

y = sp(y)
y = para(
    'O Python Sidecar e opcional: em dispositivos sem microfone ou quando o usuario prefere '
    'apenas entrada de texto, ele pode ser desabilitado sem impacto nas demais funcionalidades.', y)

y = sp(y, 20)
y = subsect('2.4', 'Comunicacao entre Componentes', y)

col_w = [130, 120, 200]
table_data = [
    ['Origem', 'Destino', 'Protocolo'],
    ['Frontend (React)', 'Node Core', 'HTTP REST + SSE (chat streaming)'],
    ['Frontend (React)', 'Node Core', 'WebSocket (eventos tempo real)'],
    ['Node Core', 'Python Sidecar', 'HTTP REST + WebSocket (voz)'],
    ['Electron (Main)', 'Node Core', 'IPC (process.send)'],
    ['Node Core', 'Extension Host', 'IPC (fork)'],
    ['Node Core', 'llama-server', 'HTTP REST (OpenAI API)'],
]
t = Table(table_data, colWidths=col_w, rowHeights=22)
t.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('TEXTCOLOR', (0, 0), (-1, 0), white),
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HDR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT]),
    ('ALIGN', (1, 0), (1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dddddd')),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
]))
y = draw_table(t, y)
y = para_small('Tabela 1: Comunicacao entre componentes.', y, size=9, leading=13)


# ═══════════════════════════════════════════════════════════════════
# SKILLS E EXTENSOES
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('3', 'Ecossistema de Skills e Extensoes', y)

y = para(
    'A MomAI e extensivel por design. Skills e extensoes sao modulos que adicionam capacidades '
    'ao sistema, seguindo o principio fundamental de que o LLM nunca se comunica diretamente '
    'com hardware ou servicos externos -- toda interacao passa por modulos intermediarios.', y)

y = sp(y)
y = subsect('3.1', 'Skills Core', y)

y = para(
    'As skills core sao modulos embutidos no sistema, registrados automaticamente na inicializacao. '
    'Cada skill possui SKILL.md (descricao semantica) e runtime.js (tools expostas ao LLM):', y)

skills_table = [
    ['Skill', 'Funcao', 'Tools Expostas'],
    ['Search', 'Busca na web', 'search_web(query)'],
    ['Weather', 'Clima e previsao', 'get_weather(location)'],
    ['Memory', 'Notas e lembretes', 'save_note(), recall()'],
    ['Scheduler', 'Agendamento', 'schedule(), list_tasks()'],
    ['Launcher', 'Apps e arquivos', 'launch_app(), open_file()'],
]
col_w2 = [100, 160, 200]
t2 = Table(skills_table, colWidths=col_w2, rowHeights=22)
t2.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('TEXTCOLOR', (0, 0), (-1, 0), white),
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HDR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT]),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dddddd')),
    ('TOPPADDING', (0, 0), (-1, -1), 2),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
]))
y = draw_table(t2, y)
y = para_small('Tabela 2: Skills core do sistema.', y, size=9, leading=13)

y = sp(y)
y = subsect('3.2', 'Extensoes da Comunidade', y)

y = para(
    'Extensoes sao modulos instalaveis via loja de extensoes, registrados em '
    'community-extensions.json. Cada extensao e um pacote contendo SKILL.md (manifesto), '
    'runtime.js (logica), e opcionalmente manifest.json (permissoes) e background-worker.js '
    '(processos persistentes).', y)

y = para(
    'Extensoes sao executadas em processos isolados via ExtensionHostManager, que utiliza '
    'fork() do Node.js para criar ambientes de execucao separados. A comunicacao com o '
    'Node Core ocorre via IPC. Extensoes persistentes (ex.: modulo WhatsApp) sao workers '
    'continuos que mantem conexoes de longa duracao.', y)

y = sp(y)
y = subsect('3.3', 'Skill Discovery', y)

y = para(
    'O processo de descoberta ocorre em cada interacao com o LLM. No tier Ultra, o sistema '
    'executa busca semantica no LanceDB utilizando embeddings dos nomes, descricoes e '
    'ferramentas das skills, combinada com busca lexical como fallback. As cinco skills '
    'mais relevantes sao convertidas em tools no formato function-calling do OpenAI e '
    'incluidas no prompt. O LLM decide autonomamente qual tool chamar.', y)


# ═══════════════════════════════════════════════════════════════════
# PIPELINE DE VOZ
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('4', 'Pipeline de Voz', y)

y = para(
    'A MomAI possui um pipeline completo de processamento de voz para operacao maos-livres, '
    'gerenciado pelo Python Sidecar e orquestrado pelo Node Core.', y)

y = sp(y)

y = para(
    'O fluxo de voz segue estas etapas: (1) WakeWordDetector captura audio do microfone e '
    'detecta as palavras "Luna" ou "Computador"; (2) o audio e enviado ao modulo STT (Whisper) '
    'para transcricao; (3) o texto transcrito e enviado ao Node Core via HTTP POST para o '
    'endpoint /chat/voice-command; (4) o Node Core processa o comando pelo mesmo fluxo do '
    'chat, com prefixo de transcricao; (5) a resposta e transmitida via WebSocket para o '
    'frontend e simultaneamente enviada ao TTS para sintese de fala.', y)

y = sp(y)

y = para(
    'O sistema oferece dois modos de operacao por voz: (a) modo padrao, onde o usuario diz '
    'a palavra de ativacao seguida do comando; (b) call mode, onde o microfone permanece '
    'aberto continuamente sem necessidade de palavra de ativacao. O TTS e pre-aquecido na '
    'inicializacao (prewarm) para reduzir latencia, utilizando Kokoro como mecanismo primario '
    'e Edge TTS como fallback.', y)


# ═══════════════════════════════════════════════════════════════════
# MOMAI EVENTS
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('5', 'MomAI Events: Nova Arquitetura', y)

y = para(
    'Enquanto a arquitetura atual resolve o problema do assistente conversacional, o MomAI '
    'Events propoe uma evolucao para um sistema cognitivo autonomo e orientado a eventos. '
    'Inspirado pelo Jarvis (Universo Marvel) como interface que entende linguagem natural '
    'e controla tudo, e pela Abelha Rainha (Resident Evil, 1996) como nucleo de inteligencia '
    'autonoma que monitora, decide e age, esta nova arquitetura transforma a MomAI de um '
    'sistema reativo para um sistema proativo.', y)

y = sp(y)
y = subsect('5.1', 'Tres Pilares Fundamentais', y)

y = para(
    'Zero Hardcode. O nucleo do sistema nao contem conhecimento previo sobre dispositivos, '
    'protocolos, modelos de ML ou comportamentos. Nenhum dispositivo, sensor ou rotina esta '
    'fixado no codigo. Tudo e descoberto dinamicamente atraves de manifestos publicados '
    'pelos modulos. O sistema nao sabe o que esta conectado ate que um modulo se registre.', y)

y = sp(y)

y = para(
    'Event-Driven. Todas as operacoes do sistema giram em torno de eventos. Sensores publicam '
    'mudancas de estado. Timers disparam apos periodo configurado. O LLM so e invocado quando '
    'algo relevante acontece. Nao ha polling, checagem constante ou ciclo ocioso. Entre ciclos '
    'cognitivos, o sistema consome recursos minimos -- o LLM permanece descarregado da memoria.', y)

y = sp(y)

y = para(
    'Auto-Modificacao. Quando um modulo nao atende uma necessidade identificada pelo LLM, '
    'o sistema pode ler, modificar e estender seu codigo para adicionar a funcionalidade '
    'faltante. Toda modificacao e testada em sandbox antes de producao. O sistema mantem '
    'versionamento para rollback, e o LLM tem limite de tentativas para evitar loop infinito.', y)

y = sp(y)
y = subsect('5.2', 'Arquitetura em Tres Camadas', y)

y = para(
    'O sistema e dividido em tres camadas com responsabilidades claramente definidas:', y)

layer_table = [
    ['Camada', 'Funcao', 'Responsabilidades'],
    ['Edge (Percepcao)', 'Interface com hardware', 'Publicar eventos de sensores; executar comandos de atuadores; configurar triggers; fornecer manifesto'],
    ['Hub (Orquestrador)', 'Estado e comunicacao', 'Blackboard de estados; timers e triggers; payload para LLM; despacho de comandos; auto-modificacao; persistencia'],
    ['LLM (Cognicao)', 'Decisao e adaptacao', 'Analisar contexto; decidir acoes e agendamentos; escrever codigo; validar politicas; informar usuario'],
]
col_w3 = [110, 130, 220]
t3 = Table(layer_table, colWidths=col_w3, rowHeights=[22, 42, 42, 42])
t3.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('TEXTCOLOR', (0, 0), (-1, 0), white),
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HDR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT, white, TABLE_ALT]),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dddddd')),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
]))
y = draw_table(t3, y)
y = para_small('Tabela 3: As tres camadas da arquitetura MomAI Events.', y, size=9, leading=13)

y = sp(y)
y = subsect('5.3', 'Modulos e Manifestos', y)

y = para(
    'Cada modulo intermediario se conecta ao Hub e publica um manifesto contendo: nome e '
    'identificador unico; categoria (sensor, actuator, perception_module, ou hybrid); descricao '
    'em linguagem natural; lista de capacidades; esquema dos dados produzidos (sensores); lista '
    'de comandos com parametros tipados (atuadores); linguagem e dependencias; estrutura de '
    'arquivos; e ambiente de execucao necessario.', y)

y = para(
    'O manifesto tambem declara como o modulo aceita ser configurado, informando onde estao '
    'seus arquivos-fonte, quais bibliotecas utiliza e como estender suas capacidades.', y)

mod_table = [
    ['Modulo', 'Hardware', 'Tools e Configuracoes'],
    ['Visao (Camera)', 'Cameras USB/IP', 'detectar_pessoas(), detectar_objetos(), reconhecer_faces()'],
    ['Audio (Microfone)', 'Microfones', 'transcrever(), detectar_palavra_chave(), falar(texto)'],
    ['Iluminacao', 'Lampadas Smart', 'ligar(), desligar(), ajustar_brilho(n), ajustar_cor(c)'],
    ['Climatizacao', 'Ar-condicionado', 'ligar(), desligar(), set_temperatura(g), set_modo(m)'],
    ['TV / Display', 'Televisao, Monitor', 'ligar(), desligar(), exibir(texto), mudar_canal(n)'],
    ['Travas / Seguranca', 'Fechaduras', 'trancar(), destrancar(), get_status()'],
]
col_w4 = [110, 120, 230]
t4 = Table(mod_table, colWidths=col_w4, rowHeights=[22, 28, 28, 22, 22, 22, 22])
t4.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('TEXTCOLOR', (0, 0), (-1, 0), white),
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HDR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT]),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dddddd')),
]))
y = draw_table(t4, y)
y = para_small('Tabela 4: Exemplos de modulos e suas capacidades.', y, size=9, leading=13)


# ═══════════════════════════════════════════════════════════════════
# CICLO COGNITIVO
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = subsect('5.4', 'O Ciclo Cognitivo em 6 Etapas', y)

y = para(
    'O ciclo cognitivo e o processo central do MomAI Events, executado toda vez que o LLM '
    'e invocado para tomar uma decisao:', y)

y = sp(y)
y = subsub('Etapa 1: Algo Acontece', y)
y = para(
    'Um modulo Edge publica um evento no barramento do Hub. O evento pode ser: mudanca '
    'detectada por sensor, timer que estourou, comando de voz do usuario, ou trigger '
    'composto configurado em ciclo anterior.', y)

y = sp(y)
y = subsub('Etapa 2: O Hub Monta o Contexto', y)
y = para(
    'O Orquestrador interrompe timers pendentes e monta o payload: estado atual de todos '
    'os sensores, manifestos dos modulos, politicas ativas do usuario, e registro de '
    'triggers configurados em ciclos anteriores.', y)

y = sp(y)
y = subsub('Etapa 3: O LLM Processa', y)
y = para(
    'O modelo analisa o cenario completo, correlaciona o evento com as politicas ativas '
    'e decide: acoes imediatas, auto-agendamento, ou reconfiguracao de modulos.', y)

y = sp(y)
y = subsub('Etapa 4: O LLM Responde', y)
y = para(
    'Resposta estruturada em tres blocos: (a) acoes -- comandos para modulos; (b) '
    'auto-agendamento -- tempo de espera e gatilhos de interrupcao; (c) reconfiguracoes '
    '-- alteracoes nos modulos, incluindo edicao de codigo.', y)

y = sp(y)
y = subsub('Etapa 5: O Hub Executa', y)
y = para(
    'Despacha comandos para os modulos corretos. Se houver reconfiguracoes, gerencia '
    'edicao -> teste em sandbox -> aplicacao ou rollback.', y)

y = sp(y)
y = subsub('Etapa 6: O Sistema Espera', y)
y = para(
    'Timer criado com o tempo definido pelo LLM. Gatilhos de interrupcao podem reiniciar '
    'o ciclo antes do tempo. Se o timer estourar, o sistema acorda sozinho para '
    'reavaliacao. Consumo minimo durante espera.', y)

y = sp(y)
y = para(
    'Entre ciclos cognitivos, o sistema consome recursos minimos. Sem polling. Sem '
    'checagem constante. Apenas eventos.', y)


# ═══════════════════════════════════════════════════════════════════
# POLITICAS, TRIGGERS, AUTO-MOD
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = subsect('5.5', 'Politicas Ativas', y)

y = para(
    'Politicas sao instrucoes em linguagem natural que o usuario fornece ao sistema para '
    'definir comportamentos esperados. Sao armazenadas em tabela persistente e incluídas '
    'em todo ciclo cognitivo. O LLM decide quais se aplicam ao contexto atual.', y)

y = sp(y)

y = para(
    'Exemplos: "So liga o ar quando tiver duas ou mais pessoas no ambiente"; "Se eu disser '
    'bom dia, me conta o relatorio do dia e liga a TV no canal de noticias"; "Se a geladeira '
    'ficar aberta por mais de 2 minutos, me avisa no som". O usuario pode adicionar, modificar '
    'ou remover politicas a qualquer momento via voz ou texto, sem reinicializacao.', y)

y = sp(y)
y = subsect('5.6', 'Triggers e Auto-Agendamento', y)

y = para(
    'O sistema opera com dois tipos de gatilho. Triggers temporais sao definidos pelo '
    'usuario ou pelo proprio LLM (ex.: "todo dia as 7h", "daqui a 5 minutos"). O Hub '
    'gerencia uma fila de timers. Quando um timer estoura, um evento e publicado.', y)

y = sp(y)

y = para(
    'Triggers de evento sao condicoes que o LLM configura nos modulos. Por exemplo, '
    'configurar o modulo de visao para publicar um evento apenas quando exatamente 2 '
    'pessoas estiverem no frame. Triggers podem ser simples (um sensor, um valor) ou '
    'compostos (AND, OR, NOT entre multiplos sensores). Toda configuracao de trigger '
    'e persistida para sobreviver a reinicializacoes.', y)

y = sp(y)
y = subsect('5.7', 'Auto-Modificacao de Modulos', y)

y = para(
    'Quando um modulo nao atende uma necessidade, o sistema pode modificar seu codigo '
    'em seis fases:', y)

y = bullet('Fase 1 -- Analise: LLM le o manifesto e o codigo-fonte do modulo.', y)
y = bullet('Fase 2 -- Planejamento: define alteracoes, dependencias e novas tools.', y)
y = bullet('Fase 3 -- Sandbox: cria copia isolada, implementa, instala dependencias.', y)
y = bullet('Fase 4 -- Validacao: executa testes para verificar funcionamento e regressoes.', y)
y = bullet('Fase 5 -- Aplicacao: se testes passam, modulo atualizado vai para producao.', y)
y = bullet('Fase 6 -- Rollback: se falha, tenta corrigir. Apos limite, aborta e avisa.', y)

y = sp(y)

y = para(
    'Mecanismos de seguranca: (a) toda modificacao e testada em sandbox; (b) versionamento '
    'para rollback manual; (c) limite de tentativas para evitar loop infinito; (d) '
    'dependencias verificadas antes da instalacao; (e) LLM avisa se recursos sao '
    'insuficientes.', y)


# ═══════════════════════════════════════════════════════════════════
# INTEGRACAO HIBRIDA
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('6', 'Integracao Hibrida: Request-Response + Event-Driven', y)

y = para(
    'O sistema nao precisa escolher entre os paradigmas request-response e event-driven. '
    'O Hub opera em modo hibrido, com duas portas de entrada que compartilham o mesmo '
    'nucleo de processamento.', y)

y = sp(y)

y = para(
    'O Chat Path (request-response) mantem o fluxo atual: usuario digita ou fala, '
    'sistema monta contexto, LLM processa e responde, skills sao chamadas se necessario, '
    'resposta em streaming SSE. E o ciclo familiar de assistente conversacional.', y)

y = sp(y)

y = para(
    'O Event Path (event-driven) segue o ciclo cognitivo completo: sensor publica evento, '
    'trigger avalia relevancia, payload e montado, LLM decide acoes e auto-agendamento, '
    'timer criado com gatilhos de interrupcao.', y)

y = sp(y)

y = para(
    'Ambos compartilham o mesmo LLM, skills, modulos, politicas, memoria e persistencia. '
    'A diferenca e quem inicia o ciclo: o usuario ou um evento autonomo.', y)

y = sp(y)

y = para(
    'O Node Core atual ja possui aproximadamente 90% da infraestrutura para se tornar '
    'o Hub. Componentes a adicionar: (a) barramento de eventos interno; (b) sistema de '
    'triggers; (c) politicas como dados persistentes; (d) timers com suporte a interrupcao. '
    'Nenhum requer reescrita do nucleo existente.', y)


# ═══════════════════════════════════════════════════════════════════
# ROTEIRO
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('7', 'Roteiro de Desenvolvimento', y)

y = para(
    'O desenvolvimento segue um plano incremental, partindo da base atual funcional em '
    'direcao a arquitetura completa do MomAI Events.', y)

road_table = [
    ['Periodo', 'Marcos', 'Status'],
    ['Hoje', 'Desktop funcional: chat, voz, skills core, extensoes, memoria semantica, LLM local com GPU', 'Concluido'],
    ['Q3 2026', 'MomAI Events: barramento de eventos, triggers, politicas ativas, ciclo cognitivo basico', 'Em andamento'],
    ['Q4 2026', 'Computer Use: visao computacional para entender tela e controlar aplicativos', 'Planejado'],
    ['Q1 2027', 'Auto-Modificacao: sandbox, versionamento, rollback automatico', 'Planejado'],
    ['Q2 2027', 'Marketplace de Extensoes: loja para criadores terceiros', 'Planejado'],
    ['H2 2027', 'Mobile + Enterprise: app iOS/Android, gerenciamento centralizado', 'Planejado'],
]
col_w5 = [90, 330, 50]
t5 = Table(road_table, colWidths=col_w5, rowHeights=[22, 32, 28, 28, 28, 28, 28])
t5.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('TEXTCOLOR', (0, 0), (-1, 0), white),
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HDR),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT]),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('ALIGN', (2, 0), (2, -1), 'CENTER'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dddddd')),
]))
y = draw_table(t5, y)
y = para_small('Tabela 5: Roteiro de desenvolvimento.', y, size=9, leading=13)

y = sp(y)

y = para(
    'Cada marco e funcional por si so, e nenhum depende de marcos posteriores para ser '
    'util. O sistema atual ja entrega valor como assistente conversacional local; o MomAI '
    'Events adiciona capacidades autonomicas sem quebrar a experiencia existente.', y)


# ═══════════════════════════════════════════════════════════════════
# CONCLUSAO
# ═══════════════════════════════════════════════════════════════════
y = sp(y, 20)
y = sect('8', 'Conclusao', y)

y = para(
    'A MomAI propoe uma arquitetura que concilia dois paradigmas aparentemente conflitantes: '
    'a simplicidade do assistente conversacional request-response e a potencia do sistema '
    'cognitivo orientado a eventos. A chave e que ambos resolvem para a mesma operacao '
    'fundamental -- montar contexto, consultar o LLM, executar decisoes -- diferenciando-se '
    'apenas em quem inicia o ciclo.', y)

y = sp(y)

y = para(
    'O sistema ja implementado demonstra a viabilidade tecnica: um assistente local que '
    'combina inferencia de LLM com acoes reais no computador, tudo executado exclusivamente '
    'na maquina do usuario. A arquitetura atual processa chat, voz, memorias e skills em '
    'fluxo integrado, com streaming em tempo real e extensoes de terceiros em ambiente isolado.', y)

y = sp(y)

y = para(
    'A nova arquitetura MomAI Events estende esse nucleo com capacidades autonomicas: '
    'percepcao por sensores, raciocinio ciclico com auto-agendamento, e adaptacao por '
    'auto-modificacao de codigo. A integracao hibrida permite que o sistema opere como '
    'assistente reativo quando o usuario inicia a interacao, e como agente proativo quando '
    'as condicoes do ambiente exigem acao autonoma.', y)

y = sp(y)

y = para(
    'O mercado de IA local esta em aceleracao: Apple Intelligence, Microsoft Copilot e '
    'Google Gemini representam o reconhecimento de que o futuro da IA e local. A MomAI '
    'se posiciona como a alternativa aberta, com privacidade por construcao e um ecossistema '
    'extensivel que qualquer desenvolvedor pode contribuir.', y)

y = sp(y, 28)
c.setStrokeColor(HexColor('#cccccc'))
c.setLineWidth(0.5)
c.line(MARGIN, y, W - MARGIN, y)
y -= 18
c.setFont('Helvetica', 9)
c.setFillColor(LIGHT_GRAY)
c.drawCentredString(W / 2, y, 'github.com/WesleyQDev  |  MomAI  |  Open Source  |  MIT License')

c.save()
print(f'PDF generated: {OUTPUT}')
print(f'Size: {os.path.getsize(OUTPUT) / 1024:.1f} KB')
print(f'Pages: {PAGE[0]}')
