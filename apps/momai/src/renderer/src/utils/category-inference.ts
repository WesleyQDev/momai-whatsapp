interface Categorizable {
  id: string
  name: string
  description: string
  tags?: string[]
  category?: string
}

const CATEGORY_PATTERNS: { id: string; label: string; icon: string; keywords: string[] }[] = [
  {
    id: 'utilities',
    label: 'Utilidades',
    icon: 'Wrench',
    keywords: ['utility', 'tool', 'utilitario', 'ferramenta', 'program', 'app', 'file', 'folder', 'url', 'open', 'launch']
  },
  {
    id: 'communication',
    label: 'Comunicação',
    icon: 'Chat',
    keywords: ['chat', 'message', 'mensagem', 'whatsapp', 'communication', 'comunicação', 'social', 'contact', 'contato', 'notification', 'notificação']
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: 'Monitor',
    keywords: ['system', 'sistema', 'info', 'dashboard', 'cpu', 'monitor', 'hardware', 'process', 'performance', 'desempenho']
  },
  {
    id: 'productivity',
    label: 'Produtividade',
    icon: 'Clock',
    keywords: ['productivity', 'produtividade', 'note', 'nota', 'task', 'tarefa', 'reminder', 'lembrete', 'schedule', 'agenda', 'organize', 'organizar']
  },
  {
    id: 'ai',
    label: 'IA',
    icon: 'Sparkles',
    keywords: ['ai', 'intelligence', 'inteligência', 'model', 'llm', 'language', 'idioma', 'learn', 'aprender', 'automation', 'automação']
  }
]

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s,._\-:;!?()]+/).filter((w) => w.length > 1)
}

export function inferExtensionCategory(ext: Categorizable): string {
  const text = `${ext.name} ${ext.description} ${(ext.tags || []).join(' ')}`
  const words = tokenize(text)

  let bestScore = 0
  let bestCategory = 'utilities'

  for (const cat of CATEGORY_PATTERNS) {
    let score = 0
    for (const kw of cat.keywords) {
      if (words.includes(kw)) score += 2
      if (ext.name.toLowerCase().includes(kw)) score += 3
      if ((ext.tags || []).some((t) => t.toLowerCase().includes(kw))) score += 4
    }
    if (score > bestScore) {
      bestScore = score
      bestCategory = cat.id
    }
  }

  return bestCategory
}

export function getCategoryLabel(id: string): string {
  return CATEGORY_PATTERNS.find((c) => c.id === id)?.label || id
}

export function getCategoryIcon(id: string): string {
  return CATEGORY_PATTERNS.find((c) => c.id === id)?.icon || 'Wrench'
}

export function computeCategories(exts: Categorizable[]): { id: string; label: string; icon: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const ext of exts) {
    if (ext.category === 'core') continue
    const cat = inferExtensionCategory(ext)
    counts[cat] = (counts[cat] || 0) + 1
  }

  return CATEGORY_PATTERNS.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    count: counts[c.id] || 0
  })).sort((a, b) => b.count - a.count)
}
