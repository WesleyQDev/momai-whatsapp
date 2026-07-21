"""Generate PDF audit report using reportlab (pure Python, no system deps)."""

import os, re
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, Preformatted
)
from reportlab.lib import colors

MD_FILE = os.path.join(os.path.dirname(__file__), 'auditoria-2026-06-23-08-47-50.md')
PDF_FILE = MD_FILE.replace('.md', '.pdf')

SEVERITY_COLORS = {
    'CRITICO': HexColor('#dc2626'),
    'ALTO': HexColor('#ea580c'),
    'MEDIO': HexColor('#ca8a04'),
    'BAIXO': HexColor('#16a34a'),
}

PAGE_WIDTH, PAGE_HEIGHT = A4

def build_styles():
    ss = getSampleStyleSheet()
    
    ss.add(ParagraphStyle('CoverTitle', fontName='Helvetica-Bold', fontSize=26,
        textColor=HexColor('#1e3a5f'), alignment=TA_CENTER, spaceAfter=12))
    ss.add(ParagraphStyle('CoverSubtitle', fontName='Helvetica', fontSize=16,
        textColor=HexColor('#2563eb'), alignment=TA_CENTER, spaceAfter=30))
    ss.add(ParagraphStyle('CoverMeta', fontName='Helvetica', fontSize=11,
        textColor=HexColor('#6b7280'), alignment=TA_CENTER, leading=20))
    ss.add(ParagraphStyle('H1', fontName='Helvetica-Bold', fontSize=18,
        textColor=HexColor('#1e3a5f'), spaceBefore=24, spaceAfter=10,
        borderWidth=0, borderPadding=0))
    ss.add(ParagraphStyle('H2', fontName='Helvetica-Bold', fontSize=14,
        textColor=HexColor('#2563eb'), spaceBefore=18, spaceAfter=8))
    ss.add(ParagraphStyle('H3', fontName='Helvetica-Bold', fontSize=12,
        textColor=HexColor('#374151'), spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle('H4', fontName='Helvetica-Bold', fontSize=11,
        textColor=HexColor('#4b5563'), spaceBefore=10, spaceAfter=4))
    ss.add(ParagraphStyle('Body', fontName='Helvetica', fontSize=9.5,
        textColor=HexColor('#1a1a1a'), alignment=TA_JUSTIFY, leading=14,
        spaceAfter=6))
    ss.add(ParagraphStyle('BodyBold', parent=ss['Body'], fontName='Helvetica-Bold'))
    ss.add(ParagraphStyle('BulletItem', parent=ss['Body'], leftIndent=20, spaceAfter=3,
        bulletIndent=8))
    ss.add(ParagraphStyle('CodeBlock', fontName='Courier', fontSize=8,
        textColor=HexColor('#e2e8f0'), backColor=HexColor('#1e293b'),
        leftIndent=12, rightIndent=12, spaceBefore=6, spaceAfter=6,
        leading=12, borderPadding=8))
    ss.add(ParagraphStyle('InlineCode', fontName='Courier', fontSize=8.5,
        textColor=HexColor('#dc2626'), backColor=HexColor('#f1f5f9')))
    ss.add(ParagraphStyle('TableCell', fontName='Helvetica', fontSize=8.5,
        leading=12, textColor=HexColor('#1a1a1a')))
    ss.add(ParagraphStyle('TableHeader', fontName='Helvetica-Bold', fontSize=8.5,
        leading=12, textColor=white))
    return ss

def parse_markdown_sections(md_text):
    lines = md_text.split('\n')
    sections = []
    current_section = {'type': 'text', 'content': [], 'level': 0}
    
    for line in lines:
        if line.startswith('# '):
            if current_section['content']:
                sections.append(current_section)
            current_section = {'type': 'h1', 'content': [line[2:].strip()], 'level': 1}
        elif line.startswith('## '):
            if current_section['content']:
                sections.append(current_section)
            current_section = {'type': 'h2', 'content': [line[3:].strip()], 'level': 2}
        elif line.startswith('### '):
            if current_section['content']:
                sections.append(current_section)
            current_section = {'type': 'h3', 'content': [line[4:].strip()], 'level': 3}
        elif line.startswith('#### '):
            if current_section['content']:
                sections.append(current_section)
            current_section = {'type': 'h4', 'content': [line[5:].strip()], 'level': 4}
        elif line.startswith('---'):
            if current_section['content']:
                sections.append(current_section)
            current_section = {'type': 'hr', 'content': [], 'level': 0}
        else:
            current_section['content'].append(line)
    
    if current_section['content']:
        sections.append(current_section)
    return sections

def severity_span(text, color):
    return f'<font color="{color}"><b>{text}</b></font>'

def format_inline(text):
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    text = re.sub(r'`(.+?)`', r'<font face="Courier" color="#dc2626"><b>\1</b></font>', text)
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    text = re.sub(r'<b>(.+?)</b>', lambda m: '<b>' + m.group(1).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&') + '</b>', text)
    text = re.sub(r'<i>(.+?)</i>', lambda m: '<i>' + m.group(1).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&') + '</i>', text)
    text = re.sub(r'<font[^>]+>(.+?)</font>', lambda m: '<font' + m.group(0).split('<font')[1].split('>')[0] + '>' + m.group(1).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&') + '</font>', text)
    return text

def parse_list_item(line):
    if line.strip().startswith('- '):
        return 'bullet', line.strip()[2:]
    elif line.strip().startswith('* '):
        return 'bullet', line.strip()[2:]
    elif re.match(r'^\d+[.]\s', line.strip()):
        return 'ordered', re.sub(r'^\d+[.]\s', '', line.strip())
    return None, None

def is_table_row(line):
    return line.strip().startswith('|') and line.strip().endswith('|')

def parse_table(lines):
    rows = []
    for line in lines:
        if is_table_row(line):
            cells = [c.strip() for c in line.strip().split('|')[1:-1]]
            rows.append(cells)
    return rows

def is_separator_row(line):
    return re.match(r'^\|[\s\-:]+\|$', line.strip()) is not None

def is_code_block_start(line):
    return line.strip().startswith('```')

def build_pdf():
    with open(MD_FILE, 'r', encoding='utf-8') as f:
        md = f.read()
    
    styles = build_styles()
    story = []
    
    # Cover page
    story.append(Spacer(1, 80*mm))
    story.append(Paragraph('Relat\u00f3rio de Auditoria', styles['CoverTitle']))
    story.append(Paragraph('MomAIOS v1.4.1', styles['CoverSubtitle']))
    story.append(Spacer(1, 15*mm))
    story.append(Paragraph(
        '<b>Data:</b> 23 de Junho de 2026<br/>'
        '<b>Escopo:</b> Completo (todo o monorepo)<br/>'
        '<b>Tipo:</b> Seguran\u00e7a, Qualidade de C\u00f3digo, Performance e Arquitetura<br/>'
        '<b>Arquivos analisados:</b> 200+<br/>'
        '<b>Problemas encontrados:</b> 38',
        styles['CoverMeta']
    ))
    story.append(Spacer(1, 25*mm))
    
    severity_data = [
        [Paragraph('<b>Gravidade</b>', styles['TableHeader']),
         Paragraph('<b>Quantidade</b>', styles['TableHeader'])],
        [Paragraph(severity_span('CR\u00cdTICO', '#dc2626'), styles['TableCell']),
         Paragraph('2', styles['TableCell'])],
        [Paragraph(severity_span('ALTO', '#ea580c'), styles['TableCell']),
         Paragraph('12', styles['TableCell'])],
        [Paragraph(severity_span('M\u00c9DIO', '#ca8a04'), styles['TableCell']),
         Paragraph('17', styles['TableCell'])],
        [Paragraph(severity_span('BAIXO', '#16a34a'), styles['TableCell']),
         Paragraph('9', styles['TableCell'])],
    ]
    st = Table(severity_data, colWidths=[80*mm, 40*mm])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), HexColor('#1e3a5f')),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, HexColor('#d1d5db')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor('#f8fafc'), white]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(st)
    story.append(PageBreak())
    
    # Process sections
    sections = parse_markdown_sections(md)
    
    in_code_block = False
    code_lines = []
    in_table = False
    table_lines = []
    in_list = False
    list_items = []
    
    for section in sections:
        if section['type'] in ('h1', 'h2', 'h3', 'h4'):
            in_code_block = False
            in_table = False
            in_list = False
            
            if code_lines:
                text = '\n'.join(code_lines)
                story.append(Preformatted(text, styles['CodeBlock']))
                code_lines = []
            
            style_map = {'h1': 'H1', 'h2': 'H2', 'h3': 'H3', 'h4': 'H4'}
            for line in section['content']:
                story.append(Paragraph(format_inline(line), styles[style_map[section['type']]]))
        
        elif section['type'] == 'hr':
            story.append(HRFlowable(width='100%', color=HexColor('#e5e7eb')))
        
        else:
            for line in section['content']:
                stripped = line.strip()
                
                if not stripped:
                    if in_code_block:
                        continue
                    if in_table and table_lines:
                        rows = parse_table(table_lines)
                        if len(rows) > 1:
                            tbl = Table(rows, colWidths=[50*mm, 70*mm, 20*mm, 30*mm])
                            tbl.setStyle(TableStyle([
                                ('BACKGROUND', (0,0), (-1,0), HexColor('#1e3a5f')),
                                ('TEXTCOLOR', (0,0), (-1,0), white),
                                ('GRID', (0,0), (-1,-1), 0.5, HexColor('#d1d5db')),
                                ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor('#f8fafc'), white]),
                                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                                ('TOPPADDING', (0,0), (-1,-1), 4),
                                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                                ('FONTSIZE', (0,0), (-1,-1), 8),
                            ]))
                            story.append(tbl)
                        table_lines = []
                        in_table = False
                    
                    if in_list and list_items:
                        for item in list_items:
                            story.append(Paragraph(f'\u2022  {format_inline(item)}', styles['BulletItem']))
                        list_items = []
                        in_list = False
                    
                    story.append(Spacer(1, 3*mm))
                    continue
                
                # Check for code block
                if stripped.startswith('```'):
                    if in_code_block:
                        story.append(Preformatted('\n'.join(code_lines), styles['CodeBlock']))
                        code_lines = []
                        in_code_block = False
                    else:
                        in_code_block = True
                    continue
                
                if in_code_block:
                    code_lines.append(line)
                    continue
                
                # Table check
                if is_table_row(stripped):
                    if is_separator_row(stripped):
                        continue
                    table_lines.append(stripped)
                    in_table = True
                    continue
                
                # List check
                list_type, content = parse_list_item(stripped)
                if list_type:
                    in_list = True
                    list_items.append(content)
                    continue
                
                # Normal paragraph
                if in_list and list_items:
                    for item in list_items:
                        story.append(Paragraph(f'\u2022  {format_inline(item)}', styles['BulletItem']))
                    list_items = []
                    in_list = False
                
                story.append(Paragraph(format_inline(stripped), styles['Body']))
    
    # Flush remaining
    if code_lines:
        story.append(Preformatted('\n'.join(code_lines), styles['CodeBlock']))
    if in_list and list_items:
        for item in list_items:
            story.append(Paragraph(f'\u2022  {format_inline(item)}', styles['BulletItem']))
    if in_table and table_lines:
        rows = parse_table(table_lines)
        if len(rows) > 1:
            tbl = Table(rows, colWidths=[50*mm, 70*mm, 20*mm, 30*mm])
            tbl.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), HexColor('#1e3a5f')),
                ('TEXTCOLOR', (0,0), (-1,0), white),
                ('GRID', (0,0), (-1,-1), 0.5, HexColor('#d1d5db')),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor('#f8fafc'), white]),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('FONTSIZE', (0,0), (-1,-1), 8),
            ]))
            story.append(tbl)
    
    # Build PDF
    doc = SimpleDocTemplate(
        PDF_FILE,
        pagesize=A4,
        topMargin=20*mm,
        bottomMargin=20*mm,
        leftMargin=18*mm,
        rightMargin=18*mm,
        title='Relatorio de Auditoria - MomAIOS',
        author='MomAIOS Audit'
    )
    doc.build(story)
    
    size_kb = os.path.getsize(PDF_FILE) / 1024
    print(f'PDF gerado: {PDF_FILE}')
    print(f'Tamanho: {size_kb:.1f} KB')

if __name__ == '__main__':
    build_pdf()
