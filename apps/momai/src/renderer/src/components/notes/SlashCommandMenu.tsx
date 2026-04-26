import React, { useEffect, useState, useRef } from 'react'
import {
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Table2,
  Heading1,
  Heading2,
  Heading3,
  Minus,
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  Link2,
  Image,
  FileCode,
  Bookmark,
  Calendar,
  AlertCircle,
  Lightbulb,
  Tag,
  Columns,
  Braces
} from 'lucide-react'

interface Command {
  id: string
  label: string
  description: string
  icon: React.ElementType
  snippet: string
  category: 'headings' | 'lists' | 'formatting' | 'blocks' | 'extras'
}

const COMMANDS: Command[] = [
  {
    id: 'h1',
    label: 'Título 1',
    description: 'Título de seção grande',
    icon: Heading1,
    snippet: '# ',
    category: 'headings'
  },
  {
    id: 'h2',
    label: 'Título 2',
    description: 'Título de seção média',
    icon: Heading2,
    snippet: '## ',
    category: 'headings'
  },
  {
    id: 'h3',
    label: 'Título 3',
    description: 'Título de seção pequena',
    icon: Heading3,
    snippet: '### ',
    category: 'headings'
  },
  {
    id: 'bullet',
    label: 'Lista de Marcadores',
    description: 'Criar uma lista simples',
    icon: List,
    snippet: '- ',
    category: 'lists'
  },
  {
    id: 'number',
    label: 'Lista Numerada',
    description: 'Criar uma lista com números',
    icon: ListOrdered,
    snippet: '1. ',
    category: 'lists'
  },
  {
    id: 'todo',
    label: 'Lista de Tarefas',
    description: 'Acompanhe tarefas com checkboxes',
    icon: CheckSquare,
    snippet: '- [ ] ',
    category: 'lists'
  },
  {
    id: 'bold',
    label: 'Negrito',
    description: 'Texto em negrito',
    icon: Bold,
    snippet: '**texto**',
    category: 'formatting'
  },
  {
    id: 'italic',
    label: 'Itálico',
    description: 'Texto em itálico',
    icon: Italic,
    snippet: '*texto*',
    category: 'formatting'
  },
  {
    id: 'strikethrough',
    label: 'Tachado',
    description: 'Texto riscado',
    icon: Strikethrough,
    snippet: '~~texto~~',
    category: 'formatting'
  },
  {
    id: 'highlight',
    label: 'Destaque',
    description: 'Texto destacado',
    icon: Highlighter,
    snippet: '==texto==',
    category: 'formatting'
  },
  {
    id: 'link',
    label: 'Link',
    description: 'Inserir um link',
    icon: Link2,
    snippet: '[texto](url)',
    category: 'formatting'
  },
  {
    id: 'wiki-link',
    label: 'Wiki Link',
    description: 'Link para outra nota',
    icon: Link2,
    snippet: '[[nome-da-nota]]',
    category: 'formatting'
  },
  {
    id: 'image',
    label: 'Imagem',
    description: 'Inserir uma imagem',
    icon: Image,
    snippet: '![alt](url)',
    category: 'formatting'
  },
  {
    id: 'inline-code',
    label: 'Código Inline',
    description: 'Código em uma linha',
    icon: FileCode,
    snippet: '`código`',
    category: 'formatting'
  },
  {
    id: 'quote',
    label: 'Citação',
    description: 'Capturar uma citação',
    icon: Quote,
    snippet: '> ',
    category: 'blocks'
  },
  {
    id: 'code',
    label: 'Bloco de Código',
    description: 'Inserir trecho de código',
    icon: Code2,
    snippet: '```\n\n```',
    category: 'blocks'
  },
  {
    id: 'table',
    label: 'Tabela',
    description: 'Inserir uma tabela simples',
    icon: Table2,
    snippet: '| Coluna 1 | Coluna 2 |\n| -------- | -------- |\n| Item 1   | Item 2   |',
    category: 'blocks'
  },
  {
    id: 'hr',
    label: 'Linha Horizontal',
    description: 'Separador visual',
    icon: Minus,
    snippet: '\n---\n',
    category: 'blocks'
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Nota destacada',
    icon: AlertCircle,
    snippet: '> [!NOTE]\n> Texto da nota',
    category: 'extras'
  },
  {
    id: 'callout-tip',
    label: 'Callout Dica',
    description: 'Dica ou sugestão',
    icon: Lightbulb,
    snippet: '> [!TIP]\n> Sua dica aqui',
    category: 'extras'
  },
  {
    id: 'callout-warning',
    label: 'Callout Aviso',
    description: 'Aviso importante',
    icon: AlertCircle,
    snippet: '> [!WARNING]\n> Aviso importante',
    category: 'extras'
  },
  {
    id: 'timestamp',
    label: 'Data/Hora',
    description: 'Inserir timestamp atual',
    icon: Calendar,
    snippet: `📅 ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    category: 'extras'
  },
  {
    id: 'bookmark',
    label: 'Bookmark',
    description: 'Marcar seção importante',
    icon: Bookmark,
    snippet: '🔖 ',
    category: 'extras'
  },
  {
    id: 'tag',
    label: 'Tag',
    description: 'Adicionar uma tag',
    icon: Tag,
    snippet: '#tag',
    category: 'extras'
  },
  {
    id: 'columns',
    label: 'Duas Colunas',
    description: 'Layout em duas colunas',
    icon: Columns,
    snippet: '| Coluna 1 | Coluna 2 |\n| -------- | -------- |\n| Conteúdo | Conteúdo |',
    category: 'extras'
  },
  {
    id: 'math',
    label: 'Fórmula Matemática',
    description: 'Bloco de equação',
    icon: Braces,
    snippet: '$$\nE = mc^2\n$$',
    category: 'extras'
  }
]

interface SlashCommandMenuProps {
  x: number
  y: number
  onSelect: (snippet: string) => void
  onClose: () => void
  query: string
}

export default function SlashCommandMenu({
  x,
  y,
  onSelect,
  onClose,
  query
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const filteredCommands = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredCommands[selectedIndex]) {
          onSelect(filteredCommands[selectedIndex].snippet)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [filteredCommands, selectedIndex, onSelect, onClose])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (filteredCommands.length === 0) return null

  const categories = ['headings', 'lists', 'formatting', 'blocks', 'extras'] as const
  const categoryLabels: Record<string, string> = {
    headings: 'Títulos',
    lists: 'Listas',
    formatting: 'Formatação',
    blocks: 'Blocos',
    extras: 'Extras'
  }

  const groupedCommands = categories
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat],
      commands: filteredCommands.filter((cmd) => cmd.category === cat)
    }))
    .filter((group) => group.commands.length > 0)

  let globalIndex = 0

  return (
    <div
      ref={menuRef}
      className="fixed z-[300] w-72 bg-card/95 backdrop-blur-xl border border-border/20 rounded-xl shadow-2xl overflow-hidden animate-zoom-in"
      style={{
        top: Math.min(y, window.innerHeight - 400),
        left: Math.min(x, window.innerWidth - 290)
      }}
    >
      <div className="px-3 py-2 border-b border-border/10">
        <span className="text-[10px] font-bold text-text-muted/50 uppercase tracking-widest">
          Comandos Markdown
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto custom-scrollbar p-1">
        {groupedCommands.map((group) => (
          <div key={group.category} className="mb-1">
            <div className="px-2 py-1">
              <span className="text-[9px] font-bold text-text-muted/30 uppercase tracking-wider">
                {group.label}
              </span>
            </div>
            {group.commands.map((cmd) => {
              const Icon = cmd.icon
              const isSelected = globalIndex === selectedIndex
              globalIndex++

              return (
                <button
                  key={cmd.id}
                  onClick={() => onSelect(cmd.snippet)}
                  onMouseEnter={() => setSelectedIndex(globalIndex - 1)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all group ${
                    isSelected
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-muted/80 hover:bg-white/5 hover:text-text'
                  }`}
                >
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0 ${
                      isSelected
                        ? 'bg-accent/20 text-accent'
                        : 'bg-input/30 text-text-muted/50 group-hover:text-text/70'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col items-start overflow-hidden flex-1 min-w-0">
                    <span className="text-xs font-medium truncate leading-none mb-0.5">
                      {cmd.label}
                    </span>
                    <span className="text-[9px] opacity-40 truncate leading-none">
                      {cmd.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
