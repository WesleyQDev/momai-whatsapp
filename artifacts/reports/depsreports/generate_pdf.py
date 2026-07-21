import re
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus.flowables import Flowable

REPORT_DIR = Path(__file__).resolve().parent
REPORT_PATH = REPORT_DIR / "depscheck-2026-05-15-14-30-00.md"
PDF_PATH = REPORT_DIR / "depscheck-2026-05-15-14-30-00.pdf"

COLOR_GREEN = HexColor('#00b894')
COLOR_YELLOW = HexColor('#fdcb6e')
COLOR_RED = HexColor('#e17055')
COLOR_DARK = HexColor('#1a1a2e')
COLOR_GRAY = HexColor('#636e72')
COLOR_LIGHT_BG = HexColor('#f8f9fa')
COLOR_BORDER = HexColor('#dfe6e9')
COLOR_BLUE = HexColor('#0984e3')

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title', fontSize=22, leading=26, spaceAfter=4,
    textColor=COLOR_DARK, fontName='Helvetica-Bold')

subtitle_style = ParagraphStyle('Subtitle', fontSize=10, leading=13,
    textColor=COLOR_GRAY, fontName='Helvetica', spaceAfter=12)

s1_style = ParagraphStyle('Section1', fontSize=16, leading=20, spaceBefore=14, spaceAfter=6,
    textColor=COLOR_DARK, fontName='Helvetica-Bold')

s2_style = ParagraphStyle('Section2', fontSize=13, leading=17, spaceBefore=10, spaceAfter=4,
    textColor=HexColor('#2d3436'), fontName='Helvetica-Bold')

s3_style = ParagraphStyle('Section3', fontSize=11, leading=14, spaceBefore=6, spaceAfter=3,
    textColor=HexColor('#444444'), fontName='Helvetica-Bold')

body = ParagraphStyle('Body', fontSize=9, leading=12.5, spaceAfter=3,
    fontName='Helvetica', alignment=TA_JUSTIFY)

bullet = ParagraphStyle('Bullet', parent=body, leftIndent=12, bulletIndent=4,
    spaceBefore=1, spaceAfter=1, fontSize=8.5, leading=11.5)

code = ParagraphStyle('Code', fontName='Courier', fontSize=7.5, leading=9.5,
    leftIndent=8, spaceBefore=2, spaceAfter=2,
    backColor=HexColor('#f4f4f4'), textColor=HexColor('#2d3436'))

small = ParagraphStyle('Small', fontSize=7.5, leading=10, textColor=COLOR_GRAY, fontName='Helvetica')

class ColorSwatch(Flowable):
    def __init__(self, color, size=8):
        super().__init__()
        self.color = color
        self.width = size
        self.height = size
    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)

def risk_cell(risk):
    c = {'🟢': COLOR_GREEN, '🟡': COLOR_YELLOW, '🔴': COLOR_RED, '🗑️': COLOR_GRAY}.get(risk, COLOR_GRAY)
    return [ColorSwatch(c, 7), Paragraph(f'<b>{risk}</b>', ParagraphStyle('RC', fontSize=8, fontName='Helvetica-Bold', leading=10))]

def build_pdf():
    doc = SimpleDocTemplate(PDF_PATH, pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=18*mm, bottomMargin=18*mm)
    W = A4[0] - 36*mm
    story = []

    # ============= CAPA =============
    story.append(Spacer(1, 15))
    story.append(Paragraph('Relat\u00f3rio de Auditoria de Depend\u00eancias', title_style))
    story.append(Paragraph('MomAIOS', ParagraphStyle('SubTitle2', fontSize=14, leading=17,
        textColor=COLOR_BLUE, fontName='Helvetica-Bold', spaceAfter=6)))
    story.append(HRFlowable(width='100%', thickness=1.5, color=COLOR_BORDER))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        '<b>Data:</b> 2026-05-15 &nbsp;&nbsp;|&nbsp;&nbsp; '
        '<b>Depend\u00eancias analisadas:</b> ~100 &nbsp;&nbsp;|&nbsp;&nbsp; '
        '<b>Candidatas investigadas:</b> 50', subtitle_style))
    story.append(Spacer(1, 4))

    # ============= SUMARIO EXECUTIVO =============
    story.append(Paragraph('Sum\u00e1rio Executivo', s1_style))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 4))

    exec_data = [
        [Paragraph('<b>Status</b>', ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=white)),
         Paragraph('<b>Quantidade</b>', ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=white))],
        [Paragraph('\U0001f7e2 Pode atualizar', body), Paragraph('29', ParagraphStyle('tc', fontSize=9, alignment=TA_CENTER))],
        [Paragraph('\U0001f7e1 Atualizar com cautela', body), Paragraph('10', ParagraphStyle('tc', fontSize=9, alignment=TA_CENTER))],
        [Paragraph('\U0001f534 N\u00e3o atualizar', body), Paragraph('7', ParagraphStyle('tc', fontSize=9, alignment=TA_CENTER))],
        [Paragraph('\U0001f5d1\ufe0f Remover (n\u00e3o utilizada)', body), Paragraph('1', ParagraphStyle('tc', fontSize=9, alignment=TA_CENTER))],
        [Paragraph('J\u00e1 atualizadas / apenas patch', body), Paragraph('~50', ParagraphStyle('tc', fontSize=9, alignment=TA_CENTER))],
        [Paragraph('<b>Total investigado</b>', ParagraphStyle('tb', fontSize=9, fontName='Helvetica-Bold')), Paragraph('<b>50</b>', ParagraphStyle('tcb', fontSize=9, fontName='Helvetica-Bold', alignment=TA_CENTER))],
    ]
    t = Table(exec_data, colWidths=[W*0.72, W*0.28])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,0), COLOR_DARK),
        ('BACKGROUND', (0,1),(0,-2), HexColor('#f0f0f0')),
        ('BACKGROUND', (0,-1),(-1,-1), HexColor('#e8e8e8')),
        ('GRID', (0,0),(-1,-1), 0.4, COLOR_BORDER),
        ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0),(-1,-1), 3),
        ('BOTTOMPADDING', (0,0),(-1,-1), 3),
        ('LEFTPADDING', (0,0),(-1,-1), 5),
        ('RIGHTPADDING', (0,0),(-1,-1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # ============= RESULTADOS DETALHADOS =============
    story.append(Paragraph('Resultados Detalhados', s1_style))

    # Helper para criar bloco de dependencia
    def dep_block(pkg, app, versao, risco, breaking, cves, perf, testes, recomendacao):
        items = []
        risk_color = {'🟢': COLOR_GREEN, '🟡': COLOR_YELLOW, '🔴': COLOR_RED, '🗑️': COLOR_GRAY}.get(risco[0], COLOR_GRAY)

        items.append(Paragraph(
            f'<font color="{risk_color.hexval()}">\u25cf</font> '
            f'<b>{pkg}</b> '
            f'<font size="8" color="{COLOR_GRAY.hexval()}">({app})</font>', s3_style))

        items.append(Paragraph(f'<b>Vers\u00e3o:</b> {versao}', bullet))
        items.append(Paragraph(f'<b>Risco:</b> {risco}', bullet))
        if breaking: items.append(Paragraph(f'<b>Breaking changes:</b> {breaking}', bullet))
        if cves: items.append(Paragraph(f'<b>CVEs corrigidos:</b> {cves}', bullet))
        if perf: items.append(Paragraph(f'<b>Performance:</b> {perf}', bullet))
        items.append(Paragraph(f'<b>Testes:</b> {testes}', bullet))
        items.append(Paragraph(f'<b>Recomenda\u00e7\u00e3o:</b> {recomendacao}', bullet))
        items.append(Spacer(1, 3))
        return items

    # ROOT
    story.append(Paragraph('ROOT (package.json)', s2_style))
    story.extend(dep_block('turbo', 'root',
        '^2.7.4 \u2192 2.9.14', '\U0001f7e2',
        'Nenhuma que afeta o MomAI',
        'CVE-2026-45772 (alta) — execu\u00e7\u00e3o de c\u00f3digo via Yarn Berry',
        'Melhoria de at\u00e9 96% no "Time to First Task"',
        'N\u00e3o (CI n\u00e3o usa turbo)',
        'Atualizar para ^2.9.14. CVE corrigida, zero breaking changes.'))
    story.append(HRFlowable(width='100%', thickness=0.3, color=COLOR_BORDER))
    story.append(Spacer(1, 4))

    # MOMAI
    story.append(Paragraph('MOMAI (apps/momai/)', s2_style))

    story.extend(dep_block('@codemirror/lang-markdown', 'momai',
        '^6.3.1 \u2192 6.5.0', '\U0001f7e2',
        'Nenhum — apenas bug fixes e features aditivas',
        'Nenhum', 'Neutro', 'N\u00e3o', 'pnpm update @codemirror/lang-markdown'))

    story.extend(dep_block('@codemirror/view', 'momai',
        '^6.38.1 \u2192 6.43.0', '\U0001f7e2',
        'Nenhum — APIs usadas (EditorView, ViewPlugin, Decoration) est\u00e1veis',
        'Nenhum', 'Neutro', 'N\u00e3o', 'pnpm update @codemirror/view'))

    story.extend(dep_block('@langchain/langgraph', 'momai',
        '^1.2.8 \u2192 1.3.0', '\U0001f7e2',
        'Nenhum (depend\u00eancia n\u00e3o utilizada diretamente)',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'Atualizar junto com @langchain/core para ^1.1.46. pnpm update @langchain/langgraph @langchain/core'))

    story.extend(dep_block('@uiw/react-codemirror', 'momai',
        '^4.23.7 \u2192 4.25.9', '\U0001f7e2',
        'Breaking em @uiw/codemirror-extensions-langs (n\u00e3o usado)',
        'Nenhum', 'Neutro (fixes ESM)', 'N\u00e3o', 'pnpm update @uiw/react-codemirror'))

    story.extend(dep_block('axios', 'momai',
        '^1.13.2 \u2192 1.16.1', '\U0001f5d1\ufe0f',
        'Nenhuma relevante (uso zero no c\u00f3digo)',
        'M\u00daLTIPLOS — Prototype pollution (alta), NO_PROXY bypass (alta), XSRF, CRLF, DoS',
        'Neutro', 'Mock existe mas nunca exercitado',
        'REMOVER — import axios em api.ts cria inst\u00e2ncia nunca usada (tudo usa fetch()).'))

    story.extend(dep_block('lucide-react', 'momai',
        '^1.11.0 \u2192 1.16.0', '\U0001f7e2',
        'Nenhum — releases apenas aditivas (novos \u00edcones)',
        'Nenhum', 'Neutro', 'N\u00e3o', 'pnpm update lucide-react'))

    story.extend(dep_block('react-router-dom', 'momai, landing-page',
        '^7.12.0 \u2192 7.15.1', '\U0001f7e2',
        'Nenhum — apenas unstable_* renomeadas (n\u00e3o usadas)',
        'CSRF, XSS via Open Redirect, SSR XSS em ScrollRestoration',
        '10-30% em Data/Framework mode', 'Parcial (LateralBar testado)',
        'pnpm up react-router-dom --latest em ambos apps'))

    story.extend(dep_block('zod', 'momai',
        '^4.3.6 \u2192 4.4.3', '\U0001f7e2',
        'Mudan\u00e7as em tuple/merge/valida\u00e7\u00e3o — nenhuma afeta (n\u00e3o importado)',
        'Nenhum', 'Neutro', 'N\u00e3o', 'pnpm update zod (dep transitiva via LangChain)'))

    story.extend(dep_block('@testing-library/jest-dom', 'momai, dev',
        '^6.6.3 \u2192 6.9.1', '\U0001f7e2',
        'Nenhum — novos matchers adicionados',
        'Nenhum', 'Melhor (chalk \u2192 picocolors)', 'Sim (7 arquivos, ~45 matchers)',
        'pnpm update @testing-library/jest-dom'))

    story.extend(dep_block('@types/node', 'momai, dev',
        '^22.19.1 \u2192 25.8.0', '\U0001f534',
        'Tipos Node 25 n\u00e3o correspondem ao runtime (Electron 39 usa Node 22.20)',
        'Nenhum', 'Risco: c\u00f3digo compila mas quebra em runtime',
        'N\u00e3o (21 arquivos mas nenhum testa APIs Node)',
        'N\u00c3O atualizar. Manter em 22.x. pnpm update @types/node para \u00faltimo patch 22.x.'))

    story.extend(dep_block('@vitejs/plugin-react', 'momai, dev',
        '^5.1.1 \u2192 6.0.2', '\U0001f534 (\u00e0 v6) / \U0001f7e2 (\u00e0 5.2.0)',
        'v6 requer Vite 8 (electron-vite 5.x n\u00e3o suporta). Remove Babel.',
        'Nenhum', 'Positivo (sem Babel) mas bloqueado',
        'N\u00e3o', 'Atualizar para 5.2.0. v6 bloqueado at\u00e9 electron-vite lan\u00e7ar stable c/ Vite 8.'))

    story.extend(dep_block('autoprefixer', 'momai, landing-page, dev',
        '^10.4.23 \u2192 10.5.0', '\U0001f7e2',
        'Nenhum', 'Nenhum', 'Neutro', 'N\u00e3o', 'pnpm update autoprefixer'))

    story.extend(dep_block('electron', 'momai, dev',
        '^39.2.6 \u2192 42.1.0', '\U0001f7e1',
        'Notifica\u00e7\u00f5es macOS agora usam UNNotification (afeta windowManager.ts)',
        'M\u00faltiplos (Chromium 142\u2192148, Node 22\u219224)',
        'Positivo (V8 14.2\u219214.8, Node 22\u219224)',
        'Sim (mock centralizado, 40 testes)',
        'Atualizar para ^42.1.0. PR\u00c9-REQ: Adicionar tratamento evento failed em Notification no windowManager.ts'))

    story.extend(dep_block('electron-builder', 'momai, dev',
        '^26.0.12 \u2192 26.8.1', '\U0001f7e2',
        'Nenhum na linha 26.x', 'Nenhum',
        'Fixes de coleta de m\u00f3dulos pnpm (26.4.1, 26.6.0, 26.8.2)',
        'N\u00e3o (build scripts)', 'pnpm update electron-builder'))

    story.extend(dep_block('eslint', 'momai, dev',
        '^9.39.1 \u2192 10.3.0', '\U0001f7e1',
        'ESLint 10 requer flat config (j\u00e1 usado), Node 20.19+ (OK)',
        'CVE em minimatch (<10.2.1) e ajv (<6.14.0) — afeta ^9.39.1',
        'Neutro', 'Sim (lint roda em CI)',
        'Atualizar para ^10.3.0. Todos os plugins compat\u00edveis. Rodar pnpm lint ap\u00f3s.'))

    story.extend(dep_block('eslint-plugin-react-hooks', 'momai, landing-page, dev',
        '^7.0.1 \u2192 7.1.1', '\U0001f7e2',
        'Nenhum — suporte ESLint 10, regras problem\u00e1ticas est\u00e3o off',
        'Nenhum', 'Compila\u00e7\u00e3o ignorada para n\u00e3o-React',
        'Sim (lint)', 'pnpm update eslint-plugin-react-hooks'))

    story.extend(dep_block('eslint-plugin-react-refresh', 'momai, landing-page, dev',
        '^0.4.24 \u2192 0.5.2', '\U0001f7e1',
        'ESM-only, configs.vite virou fun\u00e7\u00e3o, customHOCs\u2192extraHOCs',
        'Nenhum', 'Neutro', 'Sim (lint)',
        'Atualizar para ^0.5.2. PR\u00c9-REQ: ajustar configs.vite() em eslint.config.mjs'))

    story.extend(dep_block('jsdom', 'momai, dev',
        '^26.1.0 \u2192 29.1.1', '\U0001f7e2',
        'Nenhuma que afete — CSS selector, resource loading, CSSOM mudam subsistemas n\u00e3o usados',
        'Nenhum', 'Positivo (init 0.5ms + r\u00e1pido, getComputedStyle otimizado)',
        'Sim (15+ testes via vitest)', 'pnpm update jsdom'))

    story.extend(dep_block('prettier', 'momai, promo-video',
        '^3.7.4 \u2192 3.8.3', '\U0001f7e2',
        'Nenhum — mudan\u00e7as apenas em formata\u00e7\u00e3o Angular',
        'Nenhum', 'Neutro', 'Sim (format)',
        'pnpm update prettier. Landing-page precisa adicionar prettier como devDep.'))

    story.extend(dep_block('tailwindcss', 'momai, landing-page',
        '^3.4.17 \u2192 4.3.0', '\U0001f534',
        'REESCRITA COMPLETA: @tailwind\u2192@import, PostCSS mudou, JS config\u2192CSS-first, utilit\u00e1rios renomeados',
        'Nenhum', '5-100x mais r\u00e1pido (Rust) mas irrelevante vs custo migra\u00e7\u00e3o',
        'N\u00e3o (zero testes de estilo)',
        'N\u00c3O atualizar agora. Migra\u00e7\u00e3o exige esfor\u00e7o dedicado: refatorar tailwind.config.js, postcss, CSS, JSX.'))

    story.extend(dep_block('tailwindcss', 'momai-promo-video',
        '4.0.0 \u2192 4.3.0', '\U0001f7e2',
        'Nenhum (minor bump dentro da v4)', 'Nenhum', 'Positivo',
        'N\u00e3o', 'Atualizar para 4.3.0 (compat\u00edvel com @remotion/tailwind-v4)'))

    story.extend(dep_block('typescript', 'momai, landing-page, promo-video',
        '^5.9.3 \u2192 6.0.3', '\U0001f7e1',
        'types default [], baseUrl depreciado, strict default true, moduleResolution:node depreciado',
        'Nenhum', '20-50% mais r\u00e1pido (com types expl\u00edcito)',
        'Sim (typecheck)',
        'Atualizar para ^6.0.3. PR\u00c9-REQ: adicionar types:[node] nos tsconfigs, migrar baseUrl.'))

    story.extend(dep_block('@types/web', 'momai-promo-video, dev',
        '0.0.166 \u2192 0.0.349', '\U0001f7e2',
        'Nenhum — tipos evolutivos. skipLibCheck e noEmit protegem.',
        'Nenhum', 'Neutro', 'N\u00e3o', 'pnpm update @types/web'))

    story.append(Spacer(1, 4))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 6))

    # LANDING-PAGE
    story.append(Paragraph('LANDING-PAGE (apps/landing-page/)', s2_style))

    story.extend(dep_block('i18next', 'landing-page',
        '^26.0.8 \u2192 26.2.0', '\U0001f7e2',
        'Nenhum — features aditivas, type relaxations',
        'Log forging, ReDoS (v26.0.6)', 'Neutro', 'N\u00e3o',
        'pnpm update i18next'))

    story.append(Spacer(1, 4))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 6))

    # CORE
    story.append(Paragraph('CORE (apps/core/ - Python)', s2_style))

    story.extend(dep_block('fastapi', 'core',
        '>=0.128.0 \u2192 0.136.1', '\U0001f7e2',
        'Content-Type strict checking (0.132.0) — baixo risco (tr\u00e1fego local)',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'Atualizar spec para fastapi[standard]>=0.136.1'))

    story.extend(dep_block('huggingface-hub', 'core',
        '>=1.3.2 \u2192 1.15.0', '\U0001f7e2',
        'Nenhum que afete hf_hub_download (\u00fanica API usada)',
        'Nenhum', 'Bug fixes e cache', 'N\u00e3o',
        'uv sync j\u00e1 resolve para 1.15.0 com spec atual'))

    story.extend(dep_block('numpy', 'core',
        '>=2.3.3 \u2192 2.4.4', '\U0001f7e2',
        'Nenhum que afete o c\u00f3digo (uso b\u00e1sico)',
        'Heap overflow (2.4.1), memory leaks (2.4.2), buffer overrun (2.4.3)',
        'Neutro', 'N\u00e3o', 'uv lock j\u00e1 resolve para 2.4.1'))

    story.extend(dep_block('onnxruntime', 'core',
        '>=1.20.0,<1.25.0 \u2192 1.26.0 (fora do range)', '\U0001f7e1',
        'CUDA m\u00ednimo 12.0 (1.25+), ONNX 1.21.0',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'Expandir range para >=1.20.0,<1.27.0. API est\u00e1vel. Cuidado: CUDA 11.x perde GPU.'))

    story.extend(dep_block('ctranslate2', 'core',
        '>=4.4.0,<4.8.0 \u2192 4.7.1 (dentro do range)', '\U0001f7e2',
        'Nenhum entre 4.4.0 e 4.7.1', 'Nenhum',
        'Melhorias incrementais', 'N\u00e3o',
        'Range atual apropriado. 4.7.1 j\u00e1 \u00e9 latest.'))

    story.extend(dep_block('python-dotenv', 'core',
        '>=1.0.1 \u2192 1.2.2', '\U0001f7e2',
        'set_key/unset_key symlink (n\u00e3o usado). Python >=3.10 (OK).',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'uv lock atualiza para 1.2.2. load_dotenv() inalterado.'))

    story.extend(dep_block('pytest', 'core, dev',
        '>=8.0.0 \u2192 9.0.3', '\U0001f7e2',
        'Python 3.9 dropped (OK), PytestRemovedIn9Warning agora erro (sem testes)',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'Atualizar spec para pytest>=9.0.0'))

    story.extend(dep_block('pytest-asyncio', 'core, dev',
        '>=0.24.0 \u2192 1.3.0', '\U0001f7e2',
        'event_loop fixture removido (n\u00e3o usado). J\u00e1 resolve para 1.3.0.',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'Atualizar spec para pytest-asyncio>=1.0.0'))

    story.extend(dep_block('pytest-mock', 'core, dev',
        '>=3.14.0 \u2192 3.15.1', '\U0001f7e2',
        'Python 3.8 dropped (OK)', 'Nenhum', 'Neutro', 'N\u00e3o',
        'Spec >=3.14.0 j\u00e1 permite. Opcional: >=3.15.1'))

    story.append(Spacer(1, 4))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 6))

    # FORTSCRIPT
    story.append(Paragraph('FORTSCRIPT (apps/fortscript/ - Python)', s2_style))

    story.extend(dep_block('pydantic', 'fortscript',
        '>=2.12.5 \u2192 2.13.4', '\U0001f7e2',
        'PydanticUserError mudou de TypeError para RuntimeError (n\u00e3o capturado)',
        'Nenhum', 'Regex cache, Literal validators otimizados',
        'N\u00e3o', 'uv lock --upgrade-package pydantic'))

    story.extend(dep_block('rich', 'fortscript',
        '>=14.2.0 \u2192 15.0.0', '\U0001f7e2',
        'Python 3.8 dropped (projeto >=3.10). Nenhuma API breaking.',
        'Nenhum', 'Lazy loading (14.3.4) melhora startup CLI',
        'N\u00e3o', 'uv lock --upgrade-package rich. Console/RichHandler/Text est\u00e1veis.'))

    story.extend(dep_block('pytest-cov', 'fortscript, dev',
        '>=7.0.0 \u2192 7.1.0', '\U0001f7e2',
        'Nenhum (bug fix release)', 'Nenhum',
        'Corre\u00e7\u00e3o em total coverage computation', 'N\u00e3o',
        'uv lock j\u00e1 resolve para 7.1.0'))

    story.extend(dep_block('ruff', 'fortscript, dev',
        '>=0.14.10 \u2192 0.15.13', '\U0001f7e2',
        'Formata\u00e7\u00e3o de lambdas e except mudou. Nenhuma regra removida.',
        'Nenhum', 'Neutro', 'N\u00e3o',
        'uv lock --upgrade-package ruff. P\u00d3S: executar ruff format .'))

    story.extend(dep_block('taskipy', 'fortscript, dev',
        '>=1.2.1 \u2192 1.14.1', '\U0001f7e1',
        'Nenhum na API de tasks (pre/post hooks)', 'Nenhum', 'Neutro', 'N\u00e3o',
        'BLOQUEADO por conflito psutil. taskipy >=1.10 requer psutil<7, projeto tem >=7.1.3.'))

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width='100%', thickness=1, color=COLOR_DARK))
    story.append(Spacer(1, 10))

    # ============= PLANO DE ACAO =============
    story.append(Paragraph('Plano de A\u00e7\u00e3o', s1_style))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 6))

    plan_data = [
        [Paragraph('<b>App</b>', ParagraphStyle('th', fontSize=8.5, fontName='Helvetica-Bold', textColor=white)),
         Paragraph('<b>A\u00e7\u00e3o</b>', ParagraphStyle('th', fontSize=8.5, fontName='Helvetica-Bold', textColor=white))],
        ['momai', 'pnpm up @codemirror/* @uiw/react-codemirror lucide-react zod react-router-dom'],
        ['momai', 'pnpm up @testing-library/jest-dom @vitejs/plugin-react autoprefixer electron-builder'],
        ['momai', 'pnpm up eslint-plugin-react-hooks eslint-plugin-react-refresh jsdom prettier'],
        ['momai', 'pnpm up @langchain/langgraph @langchain/core @langchain/openai'],
        ['momai', 'pnpm remove axios (depois remover imports mortos em api.ts)'],
        ['momai', 'pnpm up eslint@^10.3.0 (rodar pnpm lint ap\u00f3s)'],
        ['momai', 'pnpm up electron@^42.1.0 (requer fix Notification windowManager.ts)'],
        ['momai', 'pnpm up typescript@^6.0.3 (requer ajustes tsconfig)'],
        ['', ''],
        ['momai-promo-video', 'pnpm up tailwindcss @types/web eslint@^10.3.0 typescript@^6.0.3'],
        ['', ''],
        ['landing-page', 'pnpm up i18next react-router-dom autoprefixer'],
        ['landing-page', 'pnpm up eslint-plugin-react-hooks eslint-plugin-react-refresh typescript@^6.0.3'],
        ['landing-page', 'pnpm add prettier (corrigir devDep faltante)'],
        ['', ''],
        ['root', 'pnpm up -w turbo'],
        ['', ''],
        ['core (Python)', 'uv add fastapi[standard]>=0.136.1'],
        ['core (Python)', 'uv add "onnxruntime>=1.20.0,<1.27.0" (expandir range)'],
        ['core (Python)', 'uv add pytest>=9.0.0 pytest-asyncio>=1.0.0 --dev && uv lock'],
        ['', ''],
        ['fortscript (Python)', 'uv lock --upgrade-package rich --upgrade-package pydantic'],
        ['fortscript (Python)', 'uv lock --upgrade-package ruff --upgrade-package pytest-cov'],
    ]
    pt = Table(plan_data, colWidths=[W*0.28, W*0.72])
    pt.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,0), COLOR_DARK),
        ('BACKGROUND', (0,1),(-1,-1), HexColor('#ffffff')),
        ('ROWBACKGROUNDS', (0,0),(-1,-1), [COLOR_DARK, HexColor('#ffffff'), HexColor('#f8f9fa')]*12),
        ('GRID', (0,0),(-1,-1), 0.3, COLOR_BORDER),
        ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
        ('FONTNAME', (0,0),(-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0),(-1,-1), 7.5),
        ('TOPPADDING', (0,0),(-1,-1), 2),
        ('BOTTOMPADDING', (0,0),(-1,-1), 2),
        ('LEFTPADDING', (0,0),(-1,-1), 4),
    ]))
    story.append(pt)
    story.append(Spacer(1, 10))

    # ============= INSTRUCOES ESPECIAIS =============
    story.append(Paragraph('Instru\u00e7\u00f5es Especiais', s1_style))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 4))

    instr_data = [
        [Paragraph('<b>#</b>', ParagraphStyle('th', fontSize=8.5, fontName='Helvetica-Bold', textColor=white)),
         Paragraph('<b>Instru\u00e7\u00e3o</b>', ParagraphStyle('th', fontSize=8.5, fontName='Helvetica-Bold', textColor=white))],
        ['1', 'electron 39\u219242: Adicionar tratamento do evento failed em Notification no windowManager.ts para compatibilidade macOS'],
        ['2', 'TypeScript 5\u21926: Adicionar "types": ["node"] nos tsconfigs do landing-page e promo-video. Migrar baseUrl.'],
        ['3', 'eslint-plugin-react-refresh 0.4\u21920.5: Ajustar configs.vite() para fun\u00e7\u00e3o em eslint.config.mjs'],
        ['4', 'axios: Remover import e inst\u00e2ncia api em api.ts. Remover mock em api.test.ts. pnpm remove axios.'],
        ['5', 'taskipy bloqueado: Reportar issue upstream ou fixar em 1.9.x (sem psutil).'],
        ['6', 'Prettier: Adicionar prettier ^3.8.3 aos devDependencies do landing-page.'],
    ]
    it = Table(instr_data, colWidths=[W*0.06, W*0.94])
    it.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,0), COLOR_DARK),
        ('ROWBACKGROUNDS', (0,1),(-1,-1), [HexColor('#ffffff'), HexColor('#f8f9fa')]*10),
        ('GRID', (0,0),(-1,-1), 0.3, COLOR_BORDER),
        ('VALIGN', (0,0),(-1,-1), 'TOP'),
        ('FONTNAME', (0,0),(-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0),(-1,-1), 7.5),
        ('TOPPADDING', (0,0),(-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 2.5),
        ('LEFTPADDING', (0,0),(-1,-1), 4),
    ]))
    story.append(it)
    story.append(Spacer(1, 10))

    # ============= RESUMO FINAL =============
    story.append(Paragraph('Resumo por N\u00edvel de Risco', s1_style))
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 4))

    summary_data = [
        [Paragraph('<b>Contagem</b>', ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=white)),
         Paragraph('<b>Risco</b>', ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=white)),
         Paragraph('<b>A\u00e7\u00e3o</b>', ParagraphStyle('th', fontSize=9, fontName='Helvetica-Bold', textColor=white))],
        ['29', '\U0001f7e2 Seguro', 'Atualizar via gerenciador de pacotes, sem mudan\u00e7as no c\u00f3digo'],
        ['10', '\U0001f7e1 Cautela', 'Atualizar com passos de migra\u00e7\u00e3o documentados'],
        ['7', '\U0001f534 Bloqueado', 'N\u00e3o atualizar agora (tailwindcss, vite, @types/node, taskipy)'],
        ['1', '\U0001f5d1\ufe0f Remover', 'axios (n\u00e3o usado, tem CVEs)'],
    ]
    st = Table(summary_data, colWidths=[W*0.15, W*0.2, W*0.65])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,0), COLOR_DARK),
        ('ROWBACKGROUNDS', (0,1),(-1,-1), [HexColor('#ffffff'), HexColor('#f8f9fa')]*3),
        ('GRID', (0,0),(-1,-1), 0.4, COLOR_BORDER),
        ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
        ('FONTNAME', (0,0),(-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0),(-1,-1), 8.5),
        ('TOPPADDING', (0,0),(-1,-1), 3),
        ('BOTTOMPADDING', (0,0),(-1,-1), 3),
        ('LEFTPADDING', (0,0),(-1,-1), 5),
        ('ALIGN', (0,0),(0,-1), 'CENTER'),
        ('ALIGN', (1,0),(1,-1), 'CENTER'),
    ]))
    story.append(st)
    story.append(Spacer(1, 20))

    # Footer
    story.append(HRFlowable(width='100%', thickness=0.5, color=COLOR_BORDER))
    story.append(Paragraph(
        'MomAIOS Dependency Audit | Gerado em 2026-05-15 | '
        'artifacts/reports/depsreports/depscheck-2026-05-15-14-30-00.md',
        ParagraphStyle('Footer', fontSize=6.5, textColor=COLOR_GRAY, alignment=TA_CENTER, spaceBefore=3)))

    doc.build(story)
    print(f'PDF gerado: {PDF_PATH}')

if __name__ == '__main__':
    build_pdf()
