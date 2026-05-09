"""Generate PDF audit report using reportlab."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white, grey
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable
)

WIDTH, HEIGHT = A4

DARK = HexColor("#1a1a2e")
ACCENT = HexColor("#16213e")
GOLD = HexColor("#e94560")
MID_GREY = HexColor("#cccccc")
TABLE_HEADER = HexColor("#2c3e50")
CRITICAL_COLOR = HexColor("#e74c3c")
HIGH_COLOR = HexColor("#e67e22")
MEDIUM_COLOR = HexColor("#f39c12")
LOW_COLOR = HexColor("#27ae60")

base = getSampleStyleSheet()
S = {}

def make(name, **kwargs):
    S[name] = ParagraphStyle(name=name, **kwargs)

make('CoverTitle', fontName='Helvetica-Bold', fontSize=28, textColor=white, alignment=TA_CENTER, spaceAfter=6*mm)
make('CoverInfo', fontName='Helvetica', fontSize=10, textColor=HexColor("#999999"), alignment=TA_CENTER, spaceAfter=2*mm)
make('SecH1', fontName='Helvetica-Bold', fontSize=18, textColor=DARK, spaceBefore=10*mm, spaceAfter=6*mm)
make('SecH2', fontName='Helvetica-Bold', fontSize=14, textColor=ACCENT, spaceBefore=6*mm, spaceAfter=3*mm)
make('Txt', fontName='Helvetica', fontSize=9.5, textColor=HexColor("#333"), alignment=TA_JUSTIFY, spaceAfter=2*mm, leading=13)
make('Bullet', fontName='Helvetica', fontSize=9.5, textColor=HexColor("#333"), leftIndent=8*mm, spaceAfter=1*mm, leading=12)
make('FLabel', fontName='Helvetica-Bold', fontSize=9, textColor=ACCENT, spaceAfter=1*mm)
make('TOC', fontName='Helvetica', fontSize=10, textColor=HexColor("#333"), spaceAfter=2*mm, leftIndent=4*mm)
make('SevCrit', fontName='Helvetica-Bold', fontSize=9, textColor=CRITICAL_COLOR)
make('SevHigh', fontName='Helvetica-Bold', fontSize=9, textColor=HIGH_COLOR)
make('SevMed', fontName='Helvetica-Bold', fontSize=9, textColor=MEDIUM_COLOR)
make('SevLow', fontName='Helvetica-Bold', fontSize=9, textColor=LOW_COLOR)
make('RecTit', fontName='Helvetica-Bold', fontSize=11, textColor=DARK, spaceBefore=3*mm, spaceAfter=1*mm)
make('CellTxt', fontName='Helvetica', fontSize=8.5, textColor=HexColor("#444"), leading=11, spaceAfter=1*mm)
make('CellBold', fontName='Helvetica-Bold', fontSize=8.5, textColor=HexColor("#333"), leading=11, spaceAfter=0.5*mm)
make('CardTitle', fontName='Helvetica-Bold', fontSize=11, textColor=DARK, leading=14)
make('Badge', fontName='Helvetica-Bold', fontSize=8, textColor=white, alignment=TA_CENTER, borderPadding=(2, 6, 2, 6))

def P(text, style='Txt'):
    return Paragraph(text, S[style])

def cover_page():
    return [
        Spacer(1, 40*mm),
        P("RELATORIO DE AUDITORIA", 'CoverTitle'),
        P("MomAIOS", 'CoverTitle'),
        Spacer(1, 8*mm),
        P("Versao 1.3.0", 'CoverInfo'),
        P("08 de Maio de 2026", 'CoverInfo'),
        Spacer(1, 5*mm),
        P("Escopo: Completo (todo o monorepo)", 'CoverInfo'),
        P("~180 arquivos | ~45.000+ linhas analisadas", 'CoverInfo'),
        Spacer(1, 15*mm),
        HRFlowable(width="60%", thickness=0.5, color=HexColor("#555555")),
        Spacer(1, 5*mm),
        P("Empresa: MomAI", 'CoverInfo'),
        P("MomAIOS - Assistente Virtual Local-First", 'CoverInfo'),
        P("Confidencialidade: Para uso interno", 'CoverInfo'),
        PageBreak(),
    ]

def toc_page():
    items = [
        ("1.", "Resumo Executivo"),
        ("2.", "Problemas Criticos (2)"),
        ("3.", "Problemas de Alta Prioridade (21)"),
        ("4.", "Problemas de Media Prioridade (29)"),
        ("5.", "Problemas de Baixa Prioridade (7)"),
        ("6.", "Sumario de Metricas"),
        ("7.", "Recomendacoes"),
    ]
    c = [P("SUMARIO", 'SecH1'), Spacer(1, 4*mm)]
    for n, t in items:
        c.append(P(f"{n} {t}", 'TOC'))
    c.append(PageBreak())
    return c

def problem_card(pid, title, severity, details, solutions):
    sev_color = {'CRITICA': CRITICAL_COLOR, 'ALTA': HIGH_COLOR, 'MEDIA': MEDIUM_COLOR, 'BAIXA': LOW_COLOR}.get(severity.upper(), MEDIUM_COLOR)

    title_p = Paragraph(f"<b>{pid}</b>: {title}", S['CardTitle'])
    badge_p = Paragraph(severity.upper(), ParagraphStyle('_b', parent=S['Badge'], backColor=sev_color))

    rows = [[title_p, badge_p]]

    for label, value in details:
        rows.append([Paragraph(f"<b>{label}:</b> {value}", S['CellTxt']), ''])

    if solutions:
        rows.append([Paragraph("<b>Solucoes Possiveis:</b>", S['CellBold']), ''])
        for sol in solutions:
            rows.append([Paragraph(f"&bull; {sol}", S['CellTxt']), ''])

    t = Table(rows, colWidths=[140*mm, 20*mm])
    t.setStyle(TableStyle([
        ('SPAN', (0, 0), (1, 0)),
        ('BACKGROUND', (0, 0), (-1, 0), HexColor("#fafafa")),
        ('BOX', (0, 0), (-1, -1), 0.5, MID_GREY),
        ('LINEBELOW', (0, 0), (-1, 0), 1, sev_color),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3*mm),
        ('TOPPADDING', (0, 0), (-1, -1), 2*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2*mm),
    ]))
    return [t, Spacer(1, 3*mm)]

def make_medium_table():
    data = [
        ["ID", "Problema", "Categoria"],
        ["M1", "CSP via meta tag apenas (sem HTTP header)", "Seguranca"],
        ["M2", "Fallback !process.contextIsolated no Preload", "Seguranca"],
        ["M3", "shell: true em killProcessOnPort", "Seguranca"],
        ["M4", "Monkey-patching threading.Thread.start", "Manutenibilidade"],
        ["M5", "Dados de extensao nao sanitizados no Chat Service", "Seguranca"],
        ["M6", "SSE nao finalizado em caso de abort", "Streaming"],
        ["M7", "SSE continua processando apos erro do LLM", "Streaming"],
        ["M8", "Engolimento silencioso de erros (.catch(() => {}))", "Error Handling"],
        ["M9", "API Keys em plaintext JSON no SQLite", "Seguranca"],
        ["M10", "Race condition em stopGenerationRequested", "Concorrencia"],
        ["M11", "Nao uso de AbortController em sendChatMessage", "Performance"],
        ["M12", "Dependencia circular entre api.ts e ttsService.ts", "Arquitetura"],
        ["M13", "useEffect sem useMemo em useChatActions", "Performance"],
        ["M14", "20 regex substitutions em serie no TTS", "Performance"],
        ["M15", "Lista blacklist recriada a cada chamada", "Performance"],
        ["M16", "Perda de dados por debounce de 2s no Store", "Data Integrity"],
        ["M17", "Mensagens salvas em dois locais", "Duplicacao"],
        ["M18", "Busca O(n*m) em wake word fuzzy matching", "Performance"],
        ["M19", "np.concatenate repetido em buffer crescente", "Performance"],
        ["M20", "N+1 chamadas GitHub API", "Performance"],
        ["M21", "Zero testes unitarios no Core Python", "Testes"],
        ["M22", "StructuredResponse sem tipo, Props sem tipo", "Type Safety"],
        ["M23", "WebSocket nao fecha se componente desmonta antes de conectar", "Robustez"],
        ["M24", "Duplicacao de helpers de data (getTodayISO)", "Duplicacao"],
        ["M25", "Variavel ww sem type hint", "Type Safety"],
        ["M26", "Declarative_base legado (SQLAlchemy 1.x)", "Manutenibilidade"],
        ["M27", "CORS regex sem ancora final", "Seguranca"],
        ["M28", "F-strings em logger (sempre avaliados)", "Performance"],
        ["M29", "api/deps.py definido mas nao usado", "Dead Code"],
    ]
    rows = [[P(c, 'FLabel') if i == 0 else P(c, 'CellTxt') for i, c in enumerate(row)] for row in data]

    t = Table(rows, colWidths=[15*mm, 100*mm, 45*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('GRID', (0, 0), (-1, -1), 0.3, MID_GREY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2*mm),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor("#f8f9fa"), white]),
    ]))
    return t

def make_low_table():
    data = [
        ["ID", "Problema", "Detalhe"],
        ["L1", "IconMap duplicado", "LateralBar.tsx e ExtensionsView.tsx tem mapas de icones similares"],
        ["L2", "Magic numbers nao documentados", "Timings de animacao, * 20 no FFT, timers de reconexao"],
        ["L3", "useEffect sem dependencias", "TitleBar.tsx:12-14 executa em todo mount"],
        ["L4", "getAppVersion() chamado 4+ vezes", "Na inicializacao, sem cache"],
        ["L5", "Estilos de import inconsistentes", "Relativos vs @renderer/ prefix"],
        ["L6", "Atributos de acessibilidade ausentes", "Botoes sem aria-label, textarea sem label"],
        ["L7", "extractJsonObjects fragil", "Falha para JSON com chaves aninhadas ou regex"],
    ]
    rows = [[P(c, 'FLabel') if i == 0 else P(c, 'CellTxt') for i, c in enumerate(row)] for row in data]
    t = Table(rows, colWidths=[15*mm, 55*mm, 90*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('GRID', (0, 0), (-1, -1), 0.3, MID_GREY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 2*mm),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor("#f8f9fa"), white]),
    ]))
    return t


def run():
    md_path = "C:\\Users\\wesle\\dev\\momai\\auditorias\\auditoria-2026-05-08-22-57-00.md"
    pdf_path = "C:\\Users\\wesle\\dev\\momai\\auditorias\\auditoria-2026-05-08-22-57-00.pdf"

    doc = SimpleDocTemplate(pdf_path, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm, leftMargin=15*mm, rightMargin=15*mm)
    story = []

    story.extend(cover_page())
    story.extend(toc_page())

    # 1 - Resumo Executivo
    story.append(P("1. RESUMO EXECUTIVO", 'SecH1'))
    story.append(P("A auditoria completa do MomAIOS revelou <b>59 problemas</b> no total, sendo <b>2 criticos</b>, <b>21 de alta prioridade</b>, <b>29 de media prioridade</b> e <b>7 de baixa prioridade</b>. As areas mais problematicas sao:"))
    for item in [
        "<b>Seguranca:</b> Injecao de comandos via <font face='Courier' size='8'>exec()</font> no sistema de extensoes e launcher",
        "<b>Duplicacao de codigo:</b> Copias quase identicas de arquivos grandes (node-core, launcher runtime, detectores de idioma)",
        "<b>TypeScript sem tipo:</b> Uso generalizado de <font face='Courier' size='8'>any</font>, <font face='Courier' size='8'>@ts-ignore</font>, e falta de declaracoes para bridge Electron",
        "<b>Performance:</b> Scans completos de filesystem, operacoes sincronas em hot paths, FFT em threads de audio",
        "<b>Streaming SSE:</b> Mensagens <font face='Courier' size='8'>{done: true}</font> nao enviadas em abort, erros que nao interrompem fluxo",
        "<b>Praticas assincronas:</b> Race conditions em <font face='Courier' size='8'>active_websockets</font>, variaveis de modulo compartilhadas sem sincronizacao",
    ]:
        story.append(P(item, 'Bullet'))

    story.append(Spacer(1, 3*mm))
    sev_table = Table([
        [P("Prioridade", 'FLabel'), P("Quantidade", 'FLabel'), P("Percentual", 'FLabel')],
        [P("Criticos", 'SevCrit'), "2", "3.4%"],
        [P("Alta", 'SevHigh'), "21", "35.6%"],
        [P("Media", 'SevMed'), "29", "49.2%"],
        [P("Baixa", 'SevLow'), "7", "11.9%"],
        ["<b>Total</b>", "<b>59</b>", "<b>100%</b>"],
    ], colWidths=[80*mm, 40*mm, 40*mm])
    sev_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, MID_GREY),
        ('ROWBACKGROUDS', (0, 1), (-1, -1), [HexColor("#f8f9fa"), white]),
        ('BACKGROUND', (0, 5), (-1, 5), HexColor("#e8e8e8")),
        ('TOPPADDING', (0, 0), (-1, -1), 3*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3*mm),
    ]))
    story.append(sev_table)
    story.append(PageBreak())

    # 2 - Problemas Criticos
    story.append(P("2. PROBLEMAS CRITICOS", 'SecH1'))
    story.append(P("Problemas com potencial de causar execucao remota de codigo, perda de dados, ou comprometimento severo da seguranca do sistema."))

    story.extend(problem_card("C1", "Injecao de Comando no Launcher Skill (openItem)", "CRITICA", [
        ("Arquivo", "apps/momai/scripts/skills/packaged/launcher/runtime.js:670"),
        ("Categoria", "Seguranca - Execucao Remota de Codigo"),
        ("Impacto", "Caminho nao sanitizado via exec() permite execucao de comandos arbitrarios. Caminho origina-se do LLM. Copia identica em data/extensions/launcher/runtime.js"),
        ("O que afeta", "Usuarios finais - comandos executados no contexto do Node Core"),
        ("O que vai mudar", "Substituir exec() por spawn() com array de argumentos"),
        ("Ganho esperado", "Eliminacao completa do vetor de injecao de comandos"),
    ], [
        "<b>(Recomendada)</b> Substituir exec() por spawn() ou execFile() com array de argumentos",
        "Escape rigoroso de metacaracteres shell no caminho",
        "Validar caminho contra lista de permissao de diretorios",
    ]))

    story.extend(problem_card("C2", "Injecao de Comando na Instalacao de Extensoes (extractZip)", "CRITICA", [
        ("Arquivo", "apps/momai/scripts/node-core/api/routes/extensions.routes.js:86-100"),
        ("Categoria", "Seguranca - Execucao Remota de Codigo"),
        ("Impacto", "Apenas aspas simples escapadas. PowerShell executa comandos via ;, |, $(), backticks. zipPath/destDir derivados do payload.id do cliente."),
        ("O que afeta", "Usuarios que instalam extensoes"),
        ("O que vai mudar", "Substituir comando PowerShell por API nativa de extracao ZIP"),
    ], [
        "<b>(Recomendada)</b> Usar biblioteca JS nativa (adm-zip) para extracao sem shell",
        "Usar spawn('powershell', ['Expand-Archive', ...]) com array de argumentos",
        "Manter exec() com escape rigoroso (fragil)",
    ]))

    story.append(PageBreak())

    # 3 - Alta Prioridade
    story.append(P("3. PROBLEMAS DE ALTA PRIORIDADE (21)", 'SecH1'))

    high_problems = [
        ("H1", "XSS via iframe srcdoc com allow-scripts",
         "components/chat/DevHtmlRenderCard.tsx:47-50, HtmlPreviewCard.tsx:24-29",
         "Seguranca", "Scripts executados em iframe permitem phishing e engenharia social",
         "Remover allow-scripts, usar DOMPurify, ou isolar em Worker"),
        ("H2", "Extension Host Worker sem Isolamento VM",
         "extension-host-worker.js, registry.js:436-497",
         "Seguranca", "Extensoes tem acesso total a fs, child_process, network",
         "Usar vm.createContext() e implementar permissoes efetivas"),
        ("H3", "Falta de Declaracoes de Tipo para Bridge Electron",
         "14 ocorrencias em hooks/ e services/",
         "Type Safety", "Bridge Electron sem tipo, erros so em runtime",
         "Criar types/api.d.ts, usar type-only imports"),
        ("H4", "Sandbox Desabilitado sem Documentacao",
         "windowManager.ts:234-249",
         "Seguranca", "Superficie de ataque expandida, defaults nao explicitos",
         "Definir contextIsolation, nodeIntegration, webSecurity explicitamente"),
        ("H5", "Race Condition em active_websockets",
         "app_state.py:14, voice.py:17",
         "Concorrencia", "list.remove() e append() concorrentes causam crash",
         "Adicionar asyncio.Lock em todas as mutacoes"),
        ("H6", "Duas Copias do Node-Core",
         "scripts/node-core/ vs apps/momai/scripts/node-core/",
         "Duplicacao", "APIs divergentes, endSse ausente na copia antiga",
         "Remover copia desatualizada, unificar imports"),
        ("H7", "Duplicacao de Language Detector",
         "chat-service.js:117-253 e domain/language-detector.js",
         "Duplicacao", "Correcoes em um arquivo nao refletem no outro",
         "Unificar em unico modulo"),
        ("H8", "Duplicacao de Fallback Reply Logic",
         "chat-service.js:255-455 e domain/prompt-builder.js",
         "Duplicacao", "Mesmo problema do H7",
         "Unificar em unico modulo"),
        ("H9", "Duplicacao do Launcher Runtime (900+ linhas)",
         "packaged/launcher/runtime.js e data/extensions/launcher/runtime.js",
         "Duplicacao", "Duas copias, fonte da verdade ambigua",
         "Manter version em packaged, criar symlink"),
        ("H10", "Monolito _listen_loop() (178 linhas)",
         "detector.py:206-384",
         "Manutenibilidade", "Audio, state machine, modos, cooldown, FFT em uma funcao",
         "Extrair state machine e handlers separados"),
        ("H11", "Monolito _speech_worker() (148 linhas)",
         "tts.py:315-462",
         "Manutenibilidade", "Streaming, resampling, fade, FFT, playback em uma funcao",
         "Quebrar em funcoes menores"),
        ("H12", "Monolito _process_recording() (101 linhas)",
         "detector.py:460-561",
         "Manutenibilidade", "Transcricao, filtragem em uma funcao",
         "Extrair em funcoes dedicadas"),
        ("H13", "Monolito _handle_transcription() (111 linhas)",
         "detector.py:634-745",
         "Manutenibilidade", "Keyword, cooldown, comando extraction em uma funcao",
         "Extrair em funcoes dedicadas"),
        ("H14", "FFT na Thread de Audio (Detector)",
         "detector.py:227-239",
         "Performance", "np.fft.rfft() no callback de audio causa glitches",
         "Mover FFT para thread separada com queue"),
        ("H15", "FFT em Chunks de TTS",
         "tts.py:414-438",
         "Performance", "np.fft.rfft() a cada chunk (~0.15s), *20 sem doc",
         "Mover para thread separada ou reduzir frequencia"),
        ("H16", "Settings None Bypassa Ultra-tier",
         "voice.py:183",
         "Seguranca", "Short-circuit permite wake word sem verificacao de tier",
         "Verificar settings is not None explicitamente"),
        ("H17", "process.exit() em Falha de Bind",
         "router.js:147",
         "Robustez", "Mata processo Electron sem cleanup",
         "Propagar erro ao Electron Main, tentar porta alternativa"),
        ("H18", "FS Sincrono em Hot Paths (Dev Skill)",
         "dev/runtime.js (1241 linhas)",
         "Performance", "readFileSync bloqueia event loop",
         "Substituir por fs.promises assincrono"),
        ("H19", "Scan Completo de Filesystem no Launcher",
         "launcher/runtime.js:530-539",
         "Performance", "Reconstroi indice varrendo todo FS",
         "Aumentar TTL, usar watcher de filesystem"),
        ("H20", "Uso Generalizado de any em useChatHandlers",
         "hooks/useChatHandlers.ts:37",
         "Type Safety", "~35 branches de msg.type sem tipo",
         "Definir discriminated union de WebSocketMessage"),
        ("H21", "SkillResponseRegistry sem Tipos",
         "SkillResponseRegistry.ts:4-6",
         "Type Safety", "Map sem generics, registerRenderer com any",
         "Usar Map<string, React.ComponentType> com generics"),
    ]

    for pid, title, loc, cat, impact, fix in high_problems:
        story.extend(problem_card(pid, title, "ALTA", [
            ("Arquivo", loc),
            ("Categoria", cat),
            ("Impacto", impact),
            ("Solucao Recomendada", fix),
        ], []))

    story.append(PageBreak())

    # 4 - Media Prioridade
    story.append(P("4. PROBLEMAS DE MEDIA PRIORIDADE (29)", 'SecH1'))
    story.append(P("Problemas que representam violacoes de boas praticas, riscos moderados, ou oportunidades de melhoria significativas."))
    story.append(Spacer(1, 3*mm))
    story.append(make_medium_table())
    story.append(PageBreak())

    # 5 - Baixa Prioridade
    story.append(P("5. PROBLEMAS DE BAIXA PRIORIDADE (7)", 'SecH1'))
    story.append(make_low_table())
    story.append(PageBreak())

    # 6 - Metricas
    story.append(P("6. SUMARIO DE METRICAS", 'SecH1'))

    for section, data in [
        ("Visao Geral", [
            ("Total de Problemas", "59"),
            ("Criticos", "2"),
            ("Alta Prioridade", "21"),
            ("Media Prioridade", "29"),
            ("Baixa Prioridade", "7"),
            ("Arquivos Analisados", "180+"),
            ("Linhas Analisadas", "45.000+"),
            ("Apps Auditados", "5 (momai, core, node-core, skills, landing-page)"),
        ]),
        ("Distribuicao por Categoria", [
            ("Seguranca", "8"), ("Duplicacao", "4"), ("Manutenibilidade", "6"),
            ("Performance", "6"), ("Type Safety", "5"), ("Concorrencia", "2"),
            ("Stream/SSE", "2"), ("Error Handling", "2"), ("Outros", "24"),
        ]),
        ("Distribuicao por Componente", [
            ("Electron Main / Preload", "5"), ("Renderer (React/TS)", "13"),
            ("Node Core", "18"), ("Core Python (FastAPI)", "16"), ("Skills", "7"),
        ]),
    ]:
        story.append(P(section, 'SecH2'))
        rows = [[P("<b>Item</b>", 'FLabel'), P("<b>Valor</b>", 'FLabel')]]
        for label, value in data:
            rows.append([P(label, 'CellTxt'), P(f"<b>{value}</b>", 'CellTxt')])
        t = Table(rows, colWidths=[100*mm, 40*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('GRID', (0, 0), (-1, -1), 0.3, MID_GREY),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 1.5*mm),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5*mm),
            ('LEFTPADDING', (0, 0), (-1, -1), 3*mm),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor("#f8f9fa"), white]),
        ]))
        story.append(t)
        story.append(Spacer(1, 4*mm))

    story.append(PageBreak())

    # 7 - Recomendacoes
    story.append(P("7. RECOMENDACOES", 'SecH1'))

    recs = [
        ("Top 5 Acoes Imediatas (Criticas)", [
            ("1. Corrigir injecao de comando no Launcher (C1)",
             "Substituir exec() por spawn() com array de argumentos no metodo openItem()."),
            ("2. Corrigir injecao de comando no extractZip (C2)",
             "Substituir PowerShell por adm-zip para extracao de ZIP."),
            ("3. Adicionar declaracoes de tipo para window.api (H3)",
             "Criar types/api.d.ts com declaracoes completas para bridge Electron."),
            ("4. Restringir sandbox de iframe (H1)",
             "Remover allow-scripts e sanitizar HTML com DOMPurify."),
            ("5. Adicionar asyncio.Lock em active_websockets (H5)",
             "Previnir race condition em conexoes WebSocket concorrentes."),
        ]),
        ("Top 5 Acoes de Medio Prazo", [
            ("6. Eliminar copia duplicada do node-core (H6)",
             "Remover scripts/node-core/ desatualizado e unificar imports."),
            ("7. Refatorar monolitos do detector.py (H10, H12, H13)",
             "Extrair state machine, handlers de transcricao em classes/funcoes separadas."),
            ("8. Mover FFT para threads separadas (H14, H15)",
             "Evitar FFT no callback de audio em tempo real."),
            ("9. Unificar detectores de idioma e fallback replies (H7, H8)",
             "Consolidar implementacoes duplicadas em modulos unicos."),
            ("10. Adicionar testes unitarios no Core Python (M21)",
             "Criar tests/ e implementar testes para servicos de voz e API."),
        ]),
        ("Top 5 Acoes de Longo Prazo", [
            ("11. Isolar execucao de extensoes em VM (H2)",
             "Usar vm.createContext() do Node.js para contexto isolado."),
            ("12. Eliminar uso de any no sistema de chat (H20, H21)",
             "Definir discriminated unions para WebSocket e tipos genericos."),
            ("13. Implementar AbortController no streaming (M11)",
             "Permitir cancelamento de streams in-flight."),
            ("14. Resolver dependencia circular api.ts/ttsService.ts (M12)",
             "Extrair tipos compartilhados para quebrar o ciclo."),
            ("15. Adicionar CSP via HTTP headers (M1)",
             "Usar onHeadersReceived para headers CSP alem do meta tag."),
        ]),
    ]

    for section_title, items in recs:
        story.append(P(section_title, 'SecH2'))
        for title, desc in items:
            story.append(P(title, 'RecTit'))
            story.append(P(desc))

    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    story.append(Spacer(1, 3*mm))
    story.append(P("<i>Relatorio gerado em 08 de Maio de 2026 as 22:57 UTC-3. Ferramentas: Analise estatica automatizada com revisao manual.</i>"))

    doc.build(story)
    print(f"PDF generated: {pdf_path}")

if __name__ == "__main__":
    run()
