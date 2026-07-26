# MOM-70: Melhorar Editor de Notas (UX estilo Obsidian)

**Data:** 2026-07-25
**Projeto:** 1.6.0
**Estimativa:** 2h
**Labels:** Improvement

---

## 1. Contexto

O sistema de notas do MomAI usa CodeMirror 6 com markdown e já tem:

- Sidebar com lista de notas, pastas, drag-and-drop, search
- Editor CodeMirror com syntax highlighting, slash commands, WYSIWYG oculto (headings, bold, etc.)
- Grafo de visualização de conexões entre notas via `[[wiki links]]`
- Sistema de abas
- Auto-save com debounce de 1s

O objetivo é melhorar a UX para se aproximar do Obsidian: autocomplete de wiki links, mini-grafo, atalhos de teclado, e refinamento visual.

---

## 2. Mudanças

### 2.1. Context Menu na Sidebar

**Arquivos:** `NotesView.tsx` (context menu inline), `NoteSidebar.tsx`

**Mudanças:**
- Adicionar "Criar nova nota" no topo:
  - Se clicado com o botão direito em uma nota: cria nova nota na mesma pasta
  - Se clicado em uma pasta: cria nova nota dentro dela
  - Se clicado na raiz: cria nota na raiz
- Adicionar "Abrir pasta" (abre a pasta da nota no explorador de arquivos via `window.api.notes.openFolder(id)`)
- Manter: "Renomear" (já existe), "Abrir local do arquivo" (já existe, só para notas), "Excluir"
- Nada a remover ("Selecionar tudo" já não existe no código atual)

**Comportamento:** menu positionado via `clientX`/`clientY`, fecha ao clicar fora.

---

### 2.2. F2 Renomear na Sidebar

**Arquivos:** `NotesView.tsx`

**Mudanças:**
- Adicionar listener `onKeyDown` no container principal da NotesView
- Quando F2 é pressionado e **nenhum input está focado** (nem busca, nem título, nem editor), disparar `handleStartRename` para o note activo
- O `handleStartRename` já existe e trata notas e pastas

---

### 2.3. Enter no Título Move Cursor para o Editor

**Arquivos:** `NoteEditor.tsx`

**Mudanças:**
- Adicionar `onKeyDown` no `<input>` do título
- Se `e.key === 'Enter'` (sem Shift), prevenir default e focar o CodeMirror no final do conteúdo atual
- `editorViewRef.current.focus()` + `view.dispatch({ selection: { anchor: doc.length } })`

---

### 2.4. [[Wiki Link]] Autocomplete + Brackets Inteligentes

**Arquivos:** `useEditorExtensions.ts`, novo hook `useWikiLinkAutocomplete.ts`, novo componente `WikiLinkDropdown.tsx`

Essa é a mudança mais complexa. Dividida em duas partes:

#### 2.4.1. Autocomplete ao digitar `[[`

**Trigger:** No `EditorView.updateListener`, detectar `[[` (similar ao `/` do slash menu):
- Regex: `/(?:\s|^)(\[\[)([^\]]*)$/` no texto antes do cursor
- Quando match, exibir dropdown com lista de notas

**Dropdown:**
- Posicionado na tela via `view.coordsAtPos(pos)`
- Lista as notas disponíveis (do array `notes` passado via prop/contexto)
- Top 20 resultados, filtrados por `title` (case-insensitive, `includes`)
- Formato: `📄 Nome da Nota` (e se estiver em pasta: `📄 pasta/nome`)
- Navegação: setas ↑↓, Enter seleciona, Escape fecha
- Conforme digita entre `[[` e o cursor, o filtro refina

**Ao selecionar:**
- Substituir o texto de `[[query` para `[[Título da Nota]]`
- Os colchetes `[[` e `]]` recebem `cm-md-hidden` (via decorator, como os outros elementos WYSIWYG)
- O conteúdo `Título da Nota` fica estilizado como `.cm-wiki-link`

#### 2.4.2. Hide/Show dos Colchetes

**Comportamento desejado (estilo Obsidian):**
- Quando o cursor **não está** dentro do link: colchetes escondidos via `cm-md-hidden`
- Quando o cursor está **dentro** do link (entre os `[[` e `]]`): colchetes aparecem (modo edição)

**Implementação:**
- No decorator `ViewPlugin` existente em `useEditorExtensions.ts`, modificar a lógica para wiki links:
  - Em vez de `if (isActive) continue` (que esconde tudo na linha ativa), verificar se o cursor está **especificamente dentro do range do wiki link**
  - Se o cursor está dentro do range: não aplicar `cm-md-hidden` nos colchetes
  - Se o cursor está fora do range: aplicar `cm-md-hidden` nos colchetes

#### 2.4.3. Suporte a caminhos `pasta/nota`

- O dropdown mostra o caminho completo (`pasta/subpasta/Nota`)
- Ao selecionar, insere `[[pasta/subpasta/Nota]]`
- A busca no grafo (NoteGraphView) já resolve o link comparando com `note.title` — manter assim

#### 2.4.4. Compatibilidade com `[]()` padrão

- Manter o comportamento existente dos links markdown `[texto](url)`
- O decorator já esconde colchetes e parênteses em linhas inativas
- Para consistência, aplicar a mesma lógica de "só mostrar quando cursor está dentro"

#### 2.4.5. Performance

- `notes` array tem tipicamente < 500 itens
- Filter O(n) é suficiente e não causa jank
- Dropdown limita a 20 resultados visíveis (scroll se necessário)
- Cache de nota por ID já existe no `useNotes`

---

### 2.5. Clicar Abaixo da Última Linha

**Arquivos:** `NoteEditor.tsx`

**Mudanças:**
- Adicionar handler de clique no container do editor (`.cm-scroller`)
- Detectar se o clique foi abaixo da última linha do documento
- Se sim: `view.dispatch({ selection: { anchor: doc.length } })` e focar

---

### 2.6. Mini-Grafo no Canto Inferior Direito

**Arquivos:** `NoteGraphView.tsx` (responsividade), Novo: `NoteGraphMini.tsx`, `NotesView.tsx`

**Dados compartilhados:** O mini-grafo recebe `notes` e `noteContents` via props (calculados no `NotesView` ou no próprio mini-grafo, igual ao NoteGraphView atual).

**Mudanças:**

#### 2.6.1. Novo componente `NoteGraphMini.tsx`
- Container: `fixed bottom-4 right-4 z-30`
- Dimensões: ~320x260px, com border-radius, shadow, bg-card
- Usa `react-force-graph-2d` (mesma engine do grafo full)
- Dados: mesmos nós e links do graphData atual
- Botões de zoom compactos no canto superior direito do container (ícones `ZoomIn`, `ZoomOut`, `Maximize2`)
- Tooltip nos botões em vez de texto

#### 2.6.2. Comportamento do toggle
- Estado `showGraph` em `NotesView.tsx` (já existe)
- Quando `true`: renderiza o mini-grafo
- Mini-grafo tem um botão "Expandir" que abre o grafo full-screen atual

#### 2.6.3. Node rendering no mini-grafo
- Node radius menor (2-3px base)
- Label só aparece no hover (ou nunca, só com tooltip)
- Clicar no nó: destacar conexões (como no atual)

---

### 2.7. Responsividade dos Botões/Labels do Grafo

**Arquivos:** `NoteGraphView.tsx`, `NoteGraphMini.tsx`

**Mudanças:**
- Botões de zoom: usar `w-3.5 h-3.5` (menores), padding reduzido
- Labels: `text-[10px]` no mini, `text-xs` no full
- Legend: texto menor, padding reduzido
- Hint: manter mas com fonte menor

---

### 2.8. Sidebar Visual

**Arquivos:** `NoteSidebar.tsx`, `NoteListItem.tsx`

**Mudanças:**

#### 2.8.1. Botões de ação
| Ícone | Ação | Tooltip |
|-------|------|---------|
| `SquarePen` (substitui `FilePlus`) | Nova nota | "Nova nota" |
| `FolderPlus` | Nova pasta | "Nova pasta" |
| `Folder` (Import) | Importar | "Importar" |

- Dispostos na mesma linha: **SquarePen | FolderPlus | Folder**
- Texto "Nova pasta" e "Importar" removidos
- Ícones maiores: `w-4 h-4` (antes `w-3.5 h-3.5`)
- Tooltips via atributo `title`

#### 2.8.2. Lista de notas
- **Remover** o ícone `FileText` de cada item na lista
- Manter: título truncado, indicador de ativo (barra lateral)
- Espaçamento: `pl-2` em vez de `pl-6` nos itens dentro de pastas (removendo o espaço do ícone)

---

## 3. Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `NotesView.tsx` | Context menu (add items), F2 handler, toggle mini-graph |
| `NoteSidebar.tsx` | Botões de ação (layout, ícones, tooltips), remover FileText |
| `NoteListItem.tsx` | Remover FileText icon |
| `NoteEditor.tsx` | Enter no título, clique abaixo última linha |
| `useEditorExtensions.ts` | Refinar bracket hide/show para wiki links |
| `useWikiLinkAutocomplete.ts` | **NOVO** — hook de detecção/gerenciamento do autocomplete `[[` |
| `WikiLinkDropdown.tsx` | **NOVO** — componente do dropdown de notas |
| `NoteGraphView.tsx` | Responsividade de botões/labels |
| `NoteGraphMini.tsx` | **NOVO** — mini-grafo |

## 4. Testes

- Testar F2 rename (keyboard event)
- Testar Enter no título foca editor
- Testar clique abaixo da última linha
- Testar autocomplete dropdown (render, filter, select)
- Testar mini-grafo (renderização, toggle, expandir)
- Verificar que sidebar continua funcional (sem FileText regression)
