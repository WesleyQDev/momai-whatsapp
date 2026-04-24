import React, { useEffect, useState, useRef } from 'react'
import {
  ListBulletIcon,
  QueueListIcon,
  CheckCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  CodeBracketIcon,
  TableCellsIcon,
  HashtagIcon
} from '@heroicons/react/24/outline'

interface Command {
  id: string
  label: string
  description: string
  icon: React.ElementType | string
  snippet: string
}

const COMMANDS: Command[] = [
  {
    id: 'h1',
    label: 'Título 1',
    description: 'Título de seção grande',
    icon: HashtagIcon,
    snippet: '# '
  },
  {
    id: 'h2',
    label: 'Título 2',
    description: 'Título de seção média',
    icon: HashtagIcon,
    snippet: '## '
  },
  {
    id: 'h3',
    label: 'Título 3',
    description: 'Título de seção pequena',
    icon: HashtagIcon,
    snippet: '### '
  },
  {
    id: 'bullet',
    label: 'Lista de Marcadores',
    description: 'Criar uma lista simples',
    icon: ListBulletIcon,
    snippet: '- '
  },
  {
    id: 'number',
    label: 'Lista Numerada',
    description: 'Criar uma lista com números',
    icon: QueueListIcon,
    snippet: '1. '
  },
  {
    id: 'todo',
    label: 'Lista de Tarefas',
    description: 'Acompanhe tarefas com checkboxes',
    icon: CheckCircleIcon,
    snippet: '- [ ] '
  },
  {
    id: 'quote',
    label: 'Citação',
    description: 'Capturar uma citação',
    icon: ChatBubbleBottomCenterTextIcon,
    snippet: '> '
  },
  {
    id: 'code',
    label: 'Bloco de Código',
    description: 'Inserir trecho de código',
    icon: CodeBracketIcon,
    snippet: '```\n\n```'
  },
  {
    id: 'table',
    label: 'Tabela',
    description: 'Inserir uma tabela simples',
    icon: TableCellsIcon,
    snippet: '| Coluna 1 | Coluna 2 |\n| -------- | -------- |\n| Item 1   | Item 2   |'
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
    cmd.label.toLowerCase().includes(query.toLowerCase())
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

  // Click outside listener
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

  return (
    <div
      ref={menuRef}
      className="fixed z-[300] w-64 bg-card/90 backdrop-blur-xl border border-border/20 rounded-xl shadow-2xl p-1 animate-zoom-in"
      style={{
        top: Math.min(y, window.innerHeight - 300),
        left: Math.min(x, window.innerWidth - 260)
      }}
    >
      <div className="px-2 py-1.5 mb-1">
        <span className="text-[10px] font-bold text-text-muted/50 uppercase tracking-widest">
          Comandos Rápidos
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        {filteredCommands.map((cmd, index) => {
          const Icon = cmd.icon
          const isSelected = index === selectedIndex

          return (
            <button
              key={cmd.id}
              onClick={() => onSelect(cmd.snippet)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-all group ${
                isSelected
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-muted hover:bg-white/5 hover:text-text'
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-accent/20 text-accent'
                    : 'bg-input/50 text-text-muted group-hover:text-text'
                }`}
              >
                {typeof Icon === 'string' ? (
                  <span className="text-xs font-bold">{Icon}</span>
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <div className="flex flex-col items-start overflow-hidden">
                <span className="text-[13px] font-semibold truncate leading-none mb-1">
                  {cmd.label}
                </span>
                <span className="text-[10px] opacity-40 truncate leading-none">
                  {cmd.description}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
