#!/usr/bin/env python3
"""Generate comprehensive MomAIOS documentation PDF using ReportLab."""

import os
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, cm, inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    ListFlowable,
    ListItem,
    KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.fonts import addMapping
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


OUTPUT_FILENAME = f"documentacao-completa-{datetime.now().strftime('%Y-%m-%d-%H-%M-%S')}.pdf"
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, OUTPUT_FILENAME)


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
styles = getSampleStyleSheet()

styles.add(ParagraphStyle(
    name='CoverTitle',
    parent=styles['Title'],
    fontSize=28,
    leading=34,
    spaceAfter=12,
    textColor=colors.HexColor('#1a1a2e'),
    alignment=TA_CENTER,
))

styles.add(ParagraphStyle(
    name='CoverSubtitle',
    parent=styles['Normal'],
    fontSize=14,
    leading=18,
    spaceAfter=6,
    textColor=colors.HexColor('#4a4a6a'),
    alignment=TA_CENTER,
))

styles.add(ParagraphStyle(
    name='CoverInfo',
    parent=styles['Normal'],
    fontSize=11,
    leading=14,
    spaceAfter=4,
    textColor=colors.HexColor('#666666'),
    alignment=TA_CENTER,
))

styles.add(ParagraphStyle(
    name='ChapterTitle',
    parent=styles['Heading1'],
    fontSize=20,
    leading=26,
    spaceBefore=20,
    spaceAfter=14,
    textColor=colors.HexColor('#1a1a2e'),
    borderWidth=0,
    borderPadding=0,
))

styles.add(ParagraphStyle(
    name='SectionTitle',
    parent=styles['Heading2'],
    fontSize=16,
    leading=20,
    spaceBefore=16,
    spaceAfter=10,
    textColor=colors.HexColor('#2a2a4e'),
))

styles.add(ParagraphStyle(
    name='SubSectionTitle',
    parent=styles['Heading3'],
    fontSize=13,
    leading=17,
    spaceBefore=12,
    spaceAfter=8,
    textColor=colors.HexColor('#3a3a5e'),
))

styles.add(ParagraphStyle(
    name='BodyText2',
    parent=styles['Normal'],
    fontSize=10,
    leading=14,
    spaceAfter=8,
    alignment=TA_JUSTIFY,
))

styles.add(ParagraphStyle(
    name='CodeBlock',
    parent=styles['Code'],
    fontSize=8,
    leading=10,
    spaceBefore=6,
    spaceAfter=6,
    leftIndent=10,
    backColor=colors.HexColor('#f5f5f5'),
    borderWidth=0.5,
    borderColor=colors.HexColor('#cccccc'),
    borderPadding=6,
))

styles.add(ParagraphStyle(
    name='DiagramBlock',
    parent=styles['Code'],
    fontSize=7,
    leading=8.5,
    spaceBefore=6,
    spaceAfter=6,
    leftIndent=8,
    backColor=colors.HexColor('#f8f8fc'),
    borderWidth=0.5,
    borderColor=colors.HexColor('#aaaacc'),
    borderPadding=6,
    fontName='Courier',
))

styles.add(ParagraphStyle(
    name='BulletText',
    parent=styles['Normal'],
    fontSize=10,
    leading=13,
    spaceAfter=4,
    leftIndent=20,
    bulletIndent=10,
))

styles.add(ParagraphStyle(
    name='TableCell',
    parent=styles['Normal'],
    fontSize=8,
    leading=11,
))

styles.add(ParagraphStyle(
    name='TableHeader',
    parent=styles['Normal'],
    fontSize=8,
    leading=11,
    textColor=colors.white,
    fontName='Helvetica-Bold',
))



# ---------------------------------------------------------------------------
# Helper to build a styled table from rows of text
# ---------------------------------------------------------------------------
def make_table(headers, rows, col_widths=None):
    """Build a styled Table with header row and alternating colors."""
    data = [[Paragraph(h, styles['TableHeader']) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), styles['TableCell']) for c in row])

    if col_widths is None:
        col_widths = [460 // len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a2e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f5f5ff')))
        else:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.white))

    t.setStyle(TableStyle(style_cmds))
    return t


# ---------------------------------------------------------------------------
# Content builder
# ---------------------------------------------------------------------------
def build_story():
    story = []

    # ── Cover Page ──────────────────────────────────────────────────────
    story.append(Spacer(1, 80))
    story.append(Paragraph('MomAIOS', styles['CoverTitle']))
    story.append(Paragraph('Documentacao Completa do Projeto', styles['CoverSubtitle']))
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        'MomAI &mdash; Assistente Virtual Local-First com Foco em Privacidade',
        styles['CoverInfo']
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f'Gerado em: {datetime.now().strftime("%d/%m/%Y %H:%M")}', styles['CoverInfo']))
    story.append(Paragraph('Versao: 1.3.0', styles['CoverInfo']))
    story.append(Paragraph('Licenca: MIT', styles['CoverInfo']))
    story.append(Paragraph('Autor: WesleyQDev', styles['CoverInfo']))
    story.append(Spacer(1, 40))
    story.append(Paragraph(
        'Este documento apresenta uma visao abrangente do projeto MomAIOS, '
        'cobrindo arquitetura, tecnologias, decisoes tecnicas, fluxos de dados, '
        'estrutura de diretorios, guia de desenvolvimento e muito mais. '
        'Todo o conteudo foi gerado a partir da analise do codigo-fonte e '
        'documentacao existente no repositorio.',
        styles['BodyText2']
    ))
    story.append(PageBreak())

    # ── Table of Contents ───────────────────────────────────────────────
    story.append(Paragraph('Sumario', styles['ChapterTitle']))
    story.append(Spacer(1, 10))

    toc_items = [
        ('1', 'Visao Geral do Projeto', [
            ('1.1', 'O que e o MomAIOS'),
            ('1.2', 'Publico-Alvo'),
            ('1.3', 'Filosofia de Design'),
            ('1.4', 'Arquitetura Geral'),
        ]),
        ('2', 'Tecnologias e Stack', [
            ('2.1', 'Tabela Completa de Tecnologias'),
            ('2.2', 'Por que Cada Tecnologia Foi Escolhida'),
        ]),
        ('3', 'Decisoes Tecnicas Importantes', [
            ('3.1', 'LLM Local vs Cloud'),
            ('3.2', 'Node.js vs Python para Orquestracao'),
            ('3.3', 'Sidecar Python para Voz'),
            ('3.4', 'Sistema de Tiers (Lite, Pro, Ultra)'),
            ('3.5', 'pnpm + Turborepo'),
        ]),
        ('4', 'Estrutura de Diretorios', [
            ('4.1', 'Arvore Comentada'),
        ]),
        ('5', 'Principais Funcionalidades e Fluxos', [
            ('5.1', 'Pipeline de Voz'),
            ('5.2', 'Respostas Estruturadas'),
            ('5.3', 'Sistema de Extensoes'),
            ('5.4', 'Modo Chamada (Call Mode)'),
        ]),
        ('6', 'Guia de Desenvolvimento', [
            ('6.1', 'Setup do Ambiente'),
            ('6.2', 'Comandos Essenciais'),
            ('6.3', 'Convencoes de Codigo'),
            ('6.4', 'Testes'),
            ('6.5', 'Build e Release'),
        ]),
        ('7', 'Dependencias e Bibliotecas', [
            ('7.1', 'Dependencias Criticas do Desktop'),
            ('7.2', 'Dependencias Criticas do Core'),
        ]),
        ('8', 'Configuracao e Ambiente', [
            ('8.1', 'Variaveis de Ambiente'),
            ('8.2', 'Arquivos de Configuracao'),
            ('8.3', 'CI/CD Pipeline'),
        ]),
        ('9', 'Glossario'),
    ]

    style_toc_1 = ParagraphStyle(
        'toc1', parent=styles['Normal'],
        fontSize=11, leading=16, spaceAfter=4,
        textColor=colors.HexColor('#1a1a2e'),
        fontName='Helvetica-Bold',
    )
    style_toc_2 = ParagraphStyle(
        'toc2', parent=styles['Normal'],
        fontSize=10, leading=14, spaceAfter=2,
        leftIndent=20, textColor=colors.HexColor('#333355'),
    )

    for item in toc_items:
        num, title = item[0], item[1]
        story.append(Paragraph(f'<b>{num}.</b>  {title}', style_toc_1))
        if len(item) > 2:
            for sub_num, sub_title in item[2]:
                story.append(Paragraph(f'{sub_num}  {sub_title}', style_toc_2))
    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 1: Visao Geral do Projeto
    # ====================================================================
    story.append(Paragraph('1. Visao Geral do Projeto', styles['ChapterTitle']))

    story.append(Paragraph('1.1 O que e o MomAIOS', styles['SectionTitle']))
    story.append(Paragraph(
        'MomAIOS e o monorepo que abriga o MomAI, um assistente virtual de desktop que combina '
        'a inteligencia de Modelos de Linguagem de Grande Porte (LLMs) com a capacidade de '
        'executar acoes reais no computador do usuario. Diferente de assistentes como Alexa, '
        'Google Assistant ou Siri, o MomAI foi projetado desde o inicio com um principio '
        'fundamental: privacidade em primeiro lugar. Todo o processamento, desde a deteccao da '
        'palavra de ativacao ate a geracao de respostas em texto e fala, acontece localmente '
        'na maquina do usuario.',
        styles['BodyText2']
    ))
    story.append(Paragraph(
        'O projeto e mantido por WesleyQDev e esta licenciado sob MIT, sendo totalmente '
        'gratuito e de codigo aberto.',
        styles['BodyText2']
    ))

    story.append(Paragraph('1.2 Publico-Alvo', styles['SectionTitle']))
    story.append(Paragraph(
        'O MomAI e direcionado a usuarios preocupados com privacidade que nao querem que seus '
        'dados de voz e conversas sejam enviados para servidores cloud. Tambem atende '
        'desenvolvedores que podem estender o assistente com novas capacidades atraves do '
        'sistema de extensoes, entusiastas de IA que querem executar modelos de linguagem '
        'localmente, e usuarios de PC em geral que buscam uma assistente que vai alem do '
        'basico, com integracao a notas, lembretes, pesquisa web e acoes no sistema.',
        styles['BodyText2']
    ))

    story.append(Paragraph('1.3 Filosofia de Design', styles['SectionTitle']))
    story.append(Paragraph(
        'O MomAI foi construido sobre tres pilares fundamentais. O primeiro e Local-First: '
        'tudo roda localmente e nenhum dado sai da maquina do usuario sem permissao explicita, '
        'como no caso da pesquisa web. O segundo e Extensivel: o sistema de extensoes permite '
        'que qualquer pessoa adicione novas capacidades, desde ferramentas simples para o LLM '
        'ate interfaces completas na barra lateral. O terceiro e Modular: a arquitetura com '
        'Node Core e Python Sidecar separados permite que cada componente evolua '
        'independentemente, facilitando a manutencao e os testes.',
        styles['BodyText2']
    ))

    story.append(Paragraph('1.4 Arquitetura Geral', styles['SectionTitle']))
    story.append(Paragraph(
        'O MomAIOS e organizado como um monorepo gerenciado por pnpm workspaces e Turborepo. '
        'Isso significa que multiplos aplicativos e bibliotecas vivem no mesmo repositorio, '
        'compartilhando configuracoes de build, lint e teste, mas cada um com seu proprio '
        'ciclo de vida e dependencias. O diagrama a seguir ilustra a arquitetura em alto nivel:',
        styles['BodyText2']
    ))

    arch_comp_data = [
        ['MomAI Desktop\n(Electron + React)\nInterface GUI', 'Node Core (JS)\n(LLM, Skills,\nRAG, Chat)', 'Python Sidecar\n(STT, TTS,\nWake Word)'],
        ['FortScript\n(Gaming Mode)', 'Landing Page\n(Site Instit.)', ''],
        ['llama-server (subprocesso LLM) - Modelos Qwen3.5 GGUF (0.8B, 2B, 4B)', '', ''],
    ]
    arch_table = Table(
        arch_comp_data,
        colWidths=[130, 130, 130],
    )
    arch_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, 0), 1, colors.HexColor('#1a1a2e')),
        ('BOX', (0, 1), (1, 1), 1, colors.HexColor('#1a1a2e')),
        ('BOX', (0, 2), (-1, 2), 1, colors.HexColor('#1a1a2e')),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8ff')),
        ('BACKGROUND', (0, 1), (1, 1), colors.HexColor('#f0f0f8')),
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#e0e0f0')),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('LEADING', (0, 0), (-1, -1), 11),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
    ]))
    # add connecting lines text
    story.append(arch_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        '<i>Legenda: As setas indicam comunicacao via HTTP/WebSocket. '
        'O Electron Main Process gerencia Node Core e Python Sidecar como subprocessos.</i>',
        ParagraphStyle('Caption', parent=styles['Normal'], fontSize=8, leading=10, alignment=TA_CENTER,
                       textColor=colors.HexColor('#888888'))
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        'A comunicacao entre os componentes segue uma hierarquia clara. O Electron Main Process '
        'inicia e gerencia tanto o Node Core quanto o Python Sidecar como subprocessos. O Node '
        'Core (porta 8000) e o cerebro da IA: gerencia o LLM, skills, RAG semantico e chat. '
        'O Python Sidecar (porta 8001) lida exclusivamente com audio: transcricao (STT), '
        'sintese de fala (TTS) e deteccao de palavra de ativacao. O llama-server (porta 8080) '
        'e o processo que realmente carrega o modelo GGUF e executa as inferencias. O Renderer '
        'React se comunica com o Node Core via HTTP e SSE streaming para respostas em tempo real, '
        'e com o Python Sidecar via HTTP e WebSocket para operacoes de voz.',
        styles['BodyText2']
    ))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 2: Tecnologias e Stack
    # ====================================================================
    story.append(Paragraph('2. Tecnologias e Stack', styles['ChapterTitle']))

    story.append(Paragraph('2.1 Tabela Completa de Tecnologias', styles['SectionTitle']))

    tech_data = [
        ['Electron', '39.x', 'Desktop', 'Container desktop multiplataforma'],
        ['React', '19.x', 'Desktop, Landing', 'Interface do usuario'],
        ['TypeScript', '5.9.x', 'Desktop, Landing', 'Type safety'],
        ['TailwindCSS', '3.4.x', 'Desktop, Landing', 'Estilizacao utility-first'],
        ['Vite', '7.x', 'Desktop, Landing', 'Bundler e dev server'],
        ['electron-vite', '5.x', 'Desktop', 'Bundling Electron'],
        ['electron-builder', '26.x', 'Desktop', 'Packaging (NSIS, DMG, AppImage)'],
        ['LangGraph', '1.2.x', 'Node Core', 'Orientacao de agentes'],
        ['LangChain Core', '1.1.x', 'Node Core', 'Framework de LLM'],
        ['LanceDB', '0.27.x', 'Node Core', 'Banco vetorial embedded'],
        ['Python', '3.12+', 'Core', 'Runtime sidecar de voz'],
        ['FastAPI', '0.128+', 'Core', 'Framework web assincrono'],
        ['faster-whisper', '1.2.x', 'Core', 'STT (transcricao) via CTranslate2'],
        ['kokoro-onnx', '0.5+', 'Core', 'TTS (sintese) via ONNX'],
        ['pnpm', '10.28', 'Root', 'Gerenciador de pacotes'],
        ['Turborepo', '2.7', 'Root', 'Build system do monorepo'],
    ]
    story.append(make_table(['Tecnologia', 'Versao', 'App', 'Proposito'], tech_data, [80, 70, 90, 220]))
    story.append(Spacer(1, 14))

    story.append(Paragraph('2.2 Por que Cada Tecnologia Foi Escolhida', styles['SectionTitle']))

    story.append(Paragraph('<b>Electron</b> foi escolhido como container desktop porque permite que uma base de codigo '
        'React/TypeScript rode em Windows, Linux e macOS sem modificacoes. Sua maturidade de mais '
        'de uma decada garante estabilidade e um ecossistema vasto de ferramentas como '
        'electron-builder e electron-updater.', styles['BodyText2']))

    story.append(Paragraph('<b>pnpm + Turborepo</b> formam a espinha dorsal do monorepo. pnpm foi escolhido sobre npm e yarn '
        'por seu uso eficiente de disco (hard links) e workspaces nativos. Turborepo adiciona cache '
        'inteligente de build, paralelismo e dependencias entre tarefas sem a complexidade do Nx.',
        styles['BodyText2']))

    story.append(Paragraph('<b>LanceDB</b> e o banco vetorial escolhido para memoria semantica. Diferente de solucoes como '
        'Pinecone (cloud) ou pgvector (requer PostgreSQL), o LanceDB roda embedded dentro do processo '
        'Node.js, nao requer configuracao de servidor, e e otimizado especificamente para busca vetorial.',
        styles['BodyText2']))

    story.append(Paragraph('<b>LangGraph</b> foi escolhido para orquestracao de agentes porque oferece controle fino sobre '
        'fluxos de conversacao. Diferente de cadeias lineares, o LangGraph permite grafos ciclicos, '
        'estados compartilhados entre passos e branchings condicionais.', styles['BodyText2']))

    story.append(Paragraph('<b>Kokoro-82m</b> como engine TTS roda via ONNX Runtime em CPU sem necessidade de GPU. Sua '
        'qualidade de voz e comparavel a solucoes cloud como Google Cloud TTS.', styles['BodyText2']))

    story.append(Paragraph('<b>faster-whisper</b> (CTranslate2) foi escolhido sobre whisper.cpp para STT por oferecer melhor '
        'performance em CPU.', styles['BodyText2']))

    story.append(Paragraph('<b>uv</b> como gerenciador Python foi escolhido por sua velocidade (Rust), compatibilidade com '
        'pip e instalacao simplificada.', styles['BodyText2']))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 3: Decisoes Tecnicas Importantes
    # ====================================================================
    story.append(Paragraph('3. Decisoes Tecnicas Importantes', styles['ChapterTitle']))

    story.append(Paragraph('3.1 LLM Local vs Cloud', styles['SectionTitle']))
    story.append(Paragraph(
        'O problema central era como fornecer inteligencia de LLM sem comprometer a privacidade '
        'do usuario. As alternativas consideradas foram: API OpenAI/Anthropic (cloud, facil, mas '
        'dados vao para servidores externos), llama.cpp via subprocesso (local, complexo, mas '
        'privado), e ONNX Runtime com modelos convertidos (local, mas perda de compatibilidade).',
        styles['BodyText2']
    ))
    story.append(Paragraph(
        'A escolha foi llama.cpp via subprocesso (llama-server.exe). O llama-server e um executavel '
        'maduro que implementa a API compativel com OpenAI, permitindo que o Node Core use a mesma '
        'interface que usaria para chamar a API da OpenAI, mas apontando para localhost:8080. '
        'Isso permite que o codigo trate LLM local e cloud de forma intercambiavel. O trade-off '
        'principal e que requer download de modelos de 1 a 4 GB cada e consome RAM/VRAM '
        'significativa.',
        styles['BodyText2']
    ))

    story.append(Paragraph('3.2 Node.js vs Python para Orquestracao', styles['SectionTitle']))
    story.append(Paragraph(
        'Como o Node Core roda como subprocesso do Electron, usar Node.js elimina a necessidade '
        'de bridges IPC complexas entre runtimes diferentes. O LangChain tem suporte completo a '
        'Node.js e bibliotecas como LanceDB tambem tem bindings nativos. A comunicacao entre o '
        'renderer e o Node Core e direta via HTTP na mesma porta. O trade-off e que o ecossistema '
        'de IA em Node.js e menos maduro que em Python, o que motivou a criacao do Python Sidecar '
        'para operacoes de voz.',
        styles['BodyText2']
    ))

    story.append(Paragraph('3.3 Sidecar Python para Voz', styles['SectionTitle']))
    story.append(Paragraph(
        'STT e TTS exigem bibliotecas Python especializadas sem equivalentes Node.js maduros. '
        'Em vez de executar Python inline no Node.js (fragil e dificil de debugar), a escolha foi '
        'um sidecar separado com FastAPI. Isso oferece isolamento de processo, permite reinicializacao '
        'independente, e comunicacao padronizada via HTTP/WebSocket. O Python Sidecar e enxuto '
        '(aproximadamente 900 linhas de codigo) e tem responsabilidade unica: operacoes de voz.',
        styles['BodyText2']
    ))

    story.append(Paragraph('3.4 Sistema de Tiers (Lite, Pro, Ultra)', styles['SectionTitle']))
    story.append(Paragraph(
        'Os tiers permitem que o usuario escolha entre performance (Lite: Qwen3.5-0.8B, 192 tokens, '
        'sem TTS) e qualidade (Ultra: Qwen3.5-4B, 512 tokens, TTS + wake word + memoria vetorial). '
        'Isso e essencial porque um laptop com 8GB de RAM nao consegue rodar o mesmo modelo que um '
        'desktop com 32GB. A configuracao em ai_tiers.json torna facil adicionar novos tiers ou '
        'modelos no futuro. O tier padrao e Pro (Qwen3.5-2B, 320 tokens, TTS ativado).',
        styles['BodyText2']
    ))

    adr_data = [
        ['LLM Runtime', 'llama-server (subprocesso)', 'API externa (OpenAI)', 'Privacidade total, baixa latencia'],
        ['Embeddings', 'LanceDB (local)', 'PostgreSQL pgvector', 'Zero-config, embedded'],
        ['TTS', 'Kokoro (ONNX) via Python', 'API Cloud (Google, AWS)', 'Offline, qualidade alta'],
        ['Orientacao de Agentes', 'LangGraph', 'CrewAI, AutoGen', 'Controle fino de fluxo'],
        ['Skill Runtime', 'Node.js', 'Python', 'Mesmo runtime do Electron'],
        ['Build System', 'pnpm + Turborepo', 'Nx, Lerna', 'Simplicidade, workspaces nativos'],
        ['Ger. Python', 'uv', 'Poetry, pipenv', 'Velocidade (Rust)'],
    ]
    story.append(make_table(
        ['Decisao', 'Escolha', 'Alternativa', 'Motivo'],
        adr_data,
        [90, 130, 120, 120]
    ))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 4: Estrutura de Diretorios
    # ====================================================================
    story.append(Paragraph('4. Estrutura de Diretorios', styles['ChapterTitle']))

    story.append(Paragraph('4.1 Arvore Comentada', styles['SectionTitle']))
    story.append(Paragraph(
        'A estrutura de diretorios reflete a organizacao em monorepo com pnpm workspaces. '
        'Cada aplicacao tem seu proprio diretorio em apps/ com suas dependencias e configuracao '
        'independentes. O diretorio scripts/ contem scripts de build e utilitarios. docs/ '
        'abriga a documentacao tecnica.',
        styles['BodyText2']
    ))

    tree_text = """momai/
+-- apps/
|   +-- core/              Python Sidecar (STT, TTS, Wake Word)
|   +-- fortscript/        Gaming mode process manager
|   +-- landing-page/      Site institucional (Vite + React)
|   +-- momai/             Desktop App (Electron + React)
|   |   +-- src/main/      Electron Main Process
|   |   +-- src/preload/   Bridge segura
|   |   +-- src/renderer/  React SPA
|   |   +-- scripts/       Node Core + Skills + Build scripts
|   |   +-- electron-builder.yml
|   +-- momai-promo-video/ Video promocional (Remotion)
+-- scripts/               Scripts raiz
+-- docs/                  Documentacao tecnica
+-- .github/workflows/     CI/CD (CI, Release, Deploy)
+-- package.json           Root package.json
+-- pnpm-workspace.yaml    Config workspaces
+-- turbo.json             Config Turborepo"""

    story.append(Paragraph(tree_text, styles['DiagramBlock']))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        'No coracao do projeto esta o diretorio apps/momai/, que contem o aplicativo desktop. '
        'Sua estrutura interna e dividida entre os tres processos do Electron (main, preload, '
        'renderer) e os scripts auxiliares. O Node Core, originalmente um unico arquivo de 4.432 '
        'linhas, foi refatorado para modulos em scripts/node-core/ com servicos bem definidos '
        'como chat-service, llama-manager e skill-orchestrator.',
        styles['BodyText2']
    ))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 5: Principais Funcionalidades e Fluxos
    # ====================================================================
    story.append(Paragraph('5. Principais Funcionalidades e Fluxos', styles['ChapterTitle']))

    story.append(Paragraph('5.1 Pipeline de Voz', styles['SectionTitle']))
    story.append(Paragraph(
        'O pipeline de voz e uma das funcionalidades mais complexas do MomAI, envolvendo todos '
        'os componentes do sistema. O fluxo comeca com o microfone capturando audio continuamente. '
        'O OpenWakeWord Detector, rodando no Python Sidecar 100% offline, detecta a palavra-chave '
        '"Sistema" (ou "Luna", "Computador") em menos de 100ms. Apos a deteccao, o sistema inicia '
        'gravacao do microfone e o faster-whisper transcreve o audio para texto. O texto '
        'transcrito e enviado para o Node Core, que processa o comando de voz atraves do LLM '
        'e gera uma resposta. Se o TTS estiver ativado e o tier for Pro ou Ultra, a resposta '
        'e enviada para o Kokoro TTS no Python Sidecar, que sintetiza a fala e toca nos '
        'alto-falantes.',
        styles['BodyText2']
    ))

    voice_diagram = """[Microfone] -> [Wake Word Detector (OpenWakeWord)]
                   -> [faster-whisper STT] -> [Node Core (LLM)]
                   -> [Renderer (texto)] + [Kokoro TTS (audio)]"""
    story.append(Paragraph(voice_diagram, styles['DiagramBlock']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('5.2 Respostas Estruturadas (Structured Skill Responses)', styles['SectionTitle']))
    story.append(Paragraph(
        'Skills podem retornar componentes de interface ricos em vez de texto plano. Quando '
        'uma skill retorna um structuredResponse, o Node Core serializa como JSON e envia '
        'via SSE. O frontend recebe o evento, consulta o SkillResponseRegistry para encontrar '
        'o renderizador registrado para aquele tipo, e renderiza o componente visual apropriado. '
        'Por exemplo, a skill de clima retorna um objeto com type "weather" e o WeatherCard '
        'exibe um card com previsao de 7 dias, emojis e temperaturas. O registro e flexivel: '
        'qualquer componente pode ser registrado com registerRenderer(type, Component).',
        styles['BodyText2']
    ))

    story.append(Paragraph('5.3 Sistema de Extensoes', styles['SectionTitle']))
    story.append(Paragraph(
        'O MomAI suporta tres tipos de extensoes. Skills Built-in sao nativas em scripts/skills/core/ '
        'e rodam no mesmo processo do Node Core. Skills Packaged estao em scripts/skills/packaged/ '
        'e sao executadas em host isolado. Extensions sao instaladas pelo usuario via loja de '
        'extensoes (ExtensionsView.tsx) e tambem executadas em ambiente isolado com sistema de '
        'permissoes declarativas. O manifesto da extensao (manifest.json) define permissoes de '
        'rede, sistema de arquivos e subprocesso, que sao verificados antes da execucao.',
        styles['BodyText2']
    ))

    story.append(Paragraph('5.4 Modo Chamada (Call Mode)', styles['SectionTitle']))
    story.append(Paragraph(
        'O call mode e um modo maos-livres onde o usuario pode conversar com o MomAI sem precisar '
        'digitar ou ativar por wake word a cada interacao. O wake word detector continua rodando '
        'mas sem filtro de keyword, processando qualquer fala detectada. Uma janela overlay '
        'transparente mostra o texto em tempo real. O call mode e desativado quando o usuario '
        'diz "tchau" ou desativa manualmente.',
        styles['BodyText2']
    ))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 6: Guia de Desenvolvimento
    # ====================================================================
    story.append(Paragraph('6. Guia de Desenvolvimento', styles['ChapterTitle']))

    story.append(Paragraph('6.1 Setup do Ambiente', styles['SectionTitle']))
    story.append(Paragraph(
        'Os pre-requisitos sao Node.js 20+, pnpm 9+ (instalado globalmente via npm), Python 3.12+ '
        'e Git. Apos clonar o repositorio, execute pnpm install para instalar todas as dependencias '
        'do monorepo. Para iniciar o desenvolvimento completo (desktop + backend), use pnpm dev:all. '
        'Na primeira execucao, o script ensure-dev-binaries.js baixara automaticamente os binarios '
        'necessarios como llama-server, Python bundled e uv.',
        styles['BodyText2']
    ))

    story.append(Paragraph('6.2 Comandos Essenciais', styles['SectionTitle']))
    cmd_data = [
        ['pnpm dev:all', 'Desktop + Core simultaneos'],
        ['pnpm dev:core', 'Apenas o Python backend'],
        ['pnpm --filter momai dev', 'Apenas o desktop app'],
        ['pnpm build', 'Build completo'],
        ['pnpm build:win', 'Build Windows .exe (NSIS)'],
        ['pnpm build:linux', 'Build Linux AppImage'],
        ['pnpm lint', 'Lint de todas as apps'],
        ['pnpm typecheck', 'TypeScript check'],
        ['pnpm test', 'Testes'],
        ['pnpm format', 'Prettier'],
    ]
    story.append(make_table(['Comando', 'Descricao'], cmd_data, [180, 280]))
    story.append(Spacer(1, 12))

    story.append(Paragraph('6.3 Convencoes de Codigo', styles['SectionTitle']))
    story.append(Paragraph(
        'Em TypeScript/React, componentes usam PascalCase, hooks usam prefixo use com camelCase, '
        'utilitarios usam camelCase, constantes usam UPPER_SNAKE_CASE e arquivos usam kebab-case. '
        'Testes ficam ao lado do arquivo testado com extensao .test.ts. Em Python, segue-se PEP 8 '
        'com type hints obrigatorios, async/await para I/O, snake_case para funcoes e PascalCase '
        'para classes. No FastAPI, usa-se Depends() para injecao de dependencia e schemas Pydantic '
        'para validacao.',
        styles['BodyText2']
    ))

    story.append(Paragraph('6.4 Testes', styles['SectionTitle']))
    story.append(Paragraph(
        'O desktop usa Vitest para testes unitarios, com suporte a testes do renderer (React) '
        'e do main process (Node.js). O core usa pytest com pytest-asyncio para testes '
        'assincronos. Para rodar todos os testes do monorepo, use pnpm test na raiz.',
        styles['BodyText2']
    ))

    story.append(Paragraph('6.5 Build e Release', styles['SectionTitle']))
    story.append(Paragraph(
        'O processo de release e semi-automatizado via GitHub Actions. Ao criar uma tag v1.2.3 '
        'no git, o CI detecta a tag e dispara o workflow de release. O build para Windows e '
        'Linux roda em paralelo em maquinas diferentes. Wheels Python sao pre-compiladas durante '
        'o build usando uv pip compile. O release final e publicado no repositorio publico '
        'WesleyQDev/MomAI-App com todos os artefatos de instalacao.',
        styles['BodyText2']
    ))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 7: Dependencias e Bibliotecas
    # ====================================================================
    story.append(Paragraph('7. Dependencias e Bibliotecas', styles['ChapterTitle']))

    story.append(Paragraph('7.1 Dependencias Criticas do Desktop', styles['SectionTitle']))
    story.append(Paragraph(
        'O aplicativo desktop (apps/momai/) tem cerca de 30 dependencias principais. As mais '
        'criticas sao Electron (container desktop), React (interface), @lancedb/lancedb (banco '
        'vetorial), @langchain/core e @langchain/langgraph (framework de IA), axios (HTTP), '
        'electron-updater (auto-update) e ws (WebSocket).',
        styles['BodyText2']
    ))

    dep_data = [
        ['electron', '39.x', 'Container desktop', 'Essencial'],
        ['react', '19.x', 'Interface do usuario', 'Essencial'],
        ['@lancedb/lancedb', '0.27.x', 'Banco vetorial local', 'Essencial'],
        ['@langchain/core', '1.1.x', 'Framework LLM', 'Essencial'],
        ['@langchain/langgraph', '1.2.x', 'Orientacao agentes', 'Essencial'],
        ['electron-updater', '6.8.x', 'Auto-update', 'Essencial'],
        ['ws', '8.x', 'WebSocket', 'Essencial'],
        ['axios', '1.x', 'Cliente HTTP', 'Essencial'],
        ['edge-tts-universal', '1.4.x', 'TTS fallback', 'Importante'],
        ['zod', '4.x', 'Validacao schemas', 'Utilitario'],
    ]
    story.append(make_table(['Biblioteca', 'Versao', 'Proposito', 'Nivel'], dep_data, [120, 60, 180, 70]))
    story.append(Spacer(1, 14))

    story.append(Paragraph('7.2 Dependencias Criticas do Core', styles['SectionTitle']))
    story.append(Paragraph(
        'O Python Sidecar (apps/core/) tem 11 dependencias principais. As mais criticas sao '
        'fastapi (framework web), faster-whisper e ctranslate2 (STT), kokoro-onnx e onnxruntime '
        '(TTS), sounddevice (captura de audio) e sqlalchemy (ORM).',
        styles['BodyText2']
    ))

    dep_core = [
        ['fastapi', '0.128+', 'Framework web', 'Essencial'],
        ['faster-whisper', '1.2.x', 'STT (transcricao)', 'Essencial'],
        ['kokoro-onnx', '0.5+', 'TTS (sintese de fala)', 'Essencial'],
        ['onnxruntime', '1.20+', 'Runtime ONNX', 'Essencial'],
        ['ctranslate2', '4.4.x', 'Runtime Whisper', 'Essencial'],
        ['sounddevice', '0.5+', 'Captura de audio', 'Essencial'],
        ['sqlalchemy', '2.0+', 'ORM', 'Essencial'],
        ['huggingface-hub', '1.3+', 'Download modelos', 'Essencial'],
        ['httpx', '0.28+', 'Cliente HTTP async', 'Importante'],
        ['psutil', '7.2+', 'Monitoramento', 'Importante'],
    ]
    story.append(make_table(['Biblioteca', 'Versao', 'Proposito', 'Nivel'], dep_core, [120, 60, 180, 70]))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 8: Configuracao e Ambiente
    # ====================================================================
    story.append(Paragraph('8. Configuracao e Ambiente', styles['ChapterTitle']))

    story.append(Paragraph('8.1 Variaveis de Ambiente', styles['SectionTitle']))
    story.append(Paragraph(
        'O MomAI utiliza variaveis de ambiente para configuracao em tempo de execucao. '
        'O desktop usa um arquivo .env em apps/momai/, enquanto o core usa apps/core/.env. '
        'As principais variaveis controlam as portas dos servicos, diretorios de dados e '
        'modos de debug.',
        styles['BodyText2']
    ))

    env_data = [
        ['MOMAI_NODE_CORE_HOST', '127.0.0.1', 'Host do Node Core'],
        ['MOMAI_NODE_CORE_PORT', '8000', 'Porta do Node Core'],
        ['MOMAI_PYTHON_SIDECAR_PORT', '8001', 'Porta do Python Sidecar'],
        ['MOMAI_LLAMA_PORT', '8080', 'Porta do llama-server'],
        ['MOMAI_EMBEDDING_PORT', '8081', 'Porta do servidor embeddings'],
        ['MOMAI_MODELS_DIR', 'apps/core/models/', 'Diretorio de modelos GGUF'],
        ['MOMAI_DEBUG', 'false', 'Modo debug'],
        ['LOG_LEVEL', 'info', 'Nivel de logging'],
    ]
    story.append(make_table(['Variavel', 'Default', 'Descricao'], env_data, [170, 130, 160]))
    story.append(Spacer(1, 14))

    story.append(Paragraph('8.2 Arquivos de Configuracao', styles['SectionTitle']))
    story.append(Paragraph(
        'O projeto usa varios arquivos de configuracao. electron-builder.yml define o packaging '
        'do desktop, electron.vite.config.ts configura o Vite para Electron, ai_tiers.json '
        'define os modelos e parametros de cada tier de IA, e pyproject.toml gerencia as '
        'dependencias Python. O turbo.json e pnpm-workspace.yaml configuram o build system '
        'do monorepo.',
        styles['BodyText2']
    ))

    story.append(Paragraph('8.3 CI/CD Pipeline', styles['SectionTitle']))
    story.append(Paragraph(
        'O projeto tem tres workflows do GitHub Actions. O CI (ci.yml) executa lint e typecheck '
        'em pushes e PRs para main/develop. O Release (release.yml) e acionado por tags v*.* '
        'e constroi o aplicativo para Windows e Linux em paralelo, publicando os artefatos no '
        'repositorio publico WesleyQDev/MomAI-App. O Deploy Landing Page (deploy-landing.yml) '
        'constroi e publica o site institucional no GitHub Pages.',
        styles['BodyText2']
    ))

    story.append(PageBreak())

    # ====================================================================
    # CHAPTER 9: Glossario
    # ====================================================================
    story.append(Paragraph('9. Glossario', styles['ChapterTitle']))
    story.append(Paragraph(
        'Este glossario reune os principais termos tecnicos utilizados no projeto MomAIOS.',
        styles['BodyText2']
    ))

    gloss_data = [
        ['LLM', 'Large Language Model - Modelo de Linguagem de Grande Porte'],
        ['STT', 'Speech-to-Text - Tecnologia que converte fala em texto'],
        ['TTS', 'Text-to-Speech - Tecnologia que converte texto em fala'],
        ['RAG', 'Retrieval-Augmented Generation - Busca informacao antes de gerar resposta'],
        ['SSE', 'Server-Sent Events - Stream unidirecional do servidor para o cliente'],
        ['GGUF', 'Formato de arquivo de modelo otimizado para llama.cpp'],
        ['ONNX', 'Open Neural Network Exchange - Formato aberto de modelos de ML'],
        ['Tier', 'Nivel de servico (Lite, Pro, Ultra) com diferentes capacidades'],
        ['Sidecar', 'Processo auxiliar que roda junto com o processo principal'],
        ['Wake Word', 'Palavra de ativacao que "acorda" o assistente (ex: Sistema)'],
        ['Embedding', 'Vetor numerico que representa o significado de um texto'],
        ['LangGraph', 'Framework da LangChain para orquestracao de agentes em grafo'],
        ['Monorepo', 'Unico repositorio contendo multiplos projetos independentes'],
        ['IPC', 'Inter-Process Communication - Comunicacao entre processos'],
        ['CTranslate2', 'Runtime otimizado para inferencia de modelos Transformer'],
        ['Kokoro', 'Modelo de TTS de alta qualidade que roda via ONNX'],
        ['Whisper', 'Modelo de STT da OpenAI para transcricao de audio'],
    ]
    story.append(make_table(['Termo', 'Definicao'], gloss_data, [100, 360]))

    # ── Final page ──
    story.append(Spacer(1, 40))
    story.append(Paragraph(
        '--- Fim da Documentacao ---',
        ParagraphStyle('EndMark', parent=styles['Normal'], alignment=TA_CENTER,
                       textColor=colors.HexColor('#888888'), fontSize=10)
    ))

    return story


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------
def generate_pdf():
    doc = BaseDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=25*mm,
        rightMargin=25*mm,
        topMargin=25*mm,
        bottomMargin=25*mm,
        title='MomAIOS - Documentacao Completa',
        author='WesleyQDev',
        subject='MomAIOS Project Documentation',
    )

    frame_normal = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id='normal',
    )

    def header_footer(canvas, doc):
        canvas.saveState()
        # Header line
        canvas.setStrokeColor(colors.HexColor('#1a1a2e'))
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, A4[1] - 20*mm, A4[0] - doc.rightMargin, A4[1] - 20*mm)
        # Header text
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(colors.HexColor('#888888'))
        canvas.drawString(doc.leftMargin, A4[1] - 18*mm, 'MomAIOS - Documentacao Completa')
        canvas.drawRightString(A4[0] - doc.rightMargin, A4[1] - 18*mm, f'v1.3.0')
        # Footer
        canvas.setStrokeColor(colors.HexColor('#cccccc'))
        canvas.line(doc.leftMargin, 18*mm, A4[0] - doc.rightMargin, 18*mm)
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#888888'))
        canvas.drawCentredString(A4[0] / 2, 15*mm, f'Pagina {doc.page}')
        canvas.restoreState()

    def cover_page(canvas, doc):
        pass  # No header/footer on cover

    doc.addPageTemplates([
        PageTemplate(id='Cover', frames=[frame_normal], onPage=cover_page),
        PageTemplate(id='Normal', frames=[frame_normal], onPage=header_footer),
    ])

    story = build_story()
    # First page is cover (no header/footer), rest have header/footer
    story.insert(0, NextPageTemplate('Normal'))

    doc.build(story)
    return OUTPUT_PATH


if __name__ == '__main__':
    path = generate_pdf()
    print(f'PDF generated: {path}')
    print(f'Size: {os.path.getsize(path) / 1024:.1f} KB')
