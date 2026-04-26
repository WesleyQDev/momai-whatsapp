import { Message } from '../../../services/api'

export const cleanUIMetadata = (text: string) => {
  if (!text) return ''
  return text
    .replace(/[#*`_~>[\]()]/g, '')
    .replace(/Nota:/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const humanizeToolName = (name: string) => {
  const lower = (name || '').toLowerCase()
  if (lower.includes('duckduckgo') || lower.includes('search')) return 'Busca na web'
  if (lower.includes('reminder')) return 'Lembretes'
  if (lower.includes('interface')) return 'Interface'
  if (lower.includes('os') || lower.includes('shell')) return 'Sistema OS'
  if (lower.includes('browser') || lower.includes('navigate')) return 'Navegador'
  if (lower.includes('youtube')) return 'YouTube'

  const fallback = name || 'Ferramenta'
  return fallback.charAt(0).toUpperCase() + fallback.slice(1)
}

export const minimizeText = (value: unknown, max = 180) => {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

export const humanizeActivity = (activity: string) => {
  const lower = activity.toLowerCase()
  if (lower.includes('especialista: executando')) {
    return activity.replace(/especialista: executando/i, '').trim()
  }
  if (lower.includes('manager: delegando')) {
    return activity
      .replace(/manager: delegando para especialista/i, '')
      .replace(/[()]/g, '')
      .trim()
  }
  if (lower.includes('manager: chamando ferramenta')) {
    return activity.replace(/manager: chamando ferramenta/i, '').trim()
  }
  if (lower.includes('manager: finalizando')) {
    return activity.replace(/manager: finalizando resposta/i, '').trim()
  }
  if (lower.includes('discovery:')) {
    return activity.replace(/discovery:/i, '').trim()
  }
  if (lower.includes('buscando')) {
    return activity
  }
  return ''
}

export interface ProcessedThinkResult {
  thoughts: string[]
  cleanText: string
}

export const processThinkTags = (text: string): ProcessedThinkResult => {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g
  let cleanText = text

  /* Strip <think> blocks entirely — don't show a "Pensamento" UI
     since local LLM thinking is disabled server-side. */
  cleanText = text.replace(thinkRegex, '').trim()
  return { thoughts: [], cleanText }
}

export const ACTION_MARKER = '__MOMAI_ACTIONS__'

export interface UnifiedStep {
  isMemory: boolean
  name: string
  description?: string
  rawName?: string
  isSkill?: boolean
  step?: any
  status?: string
  originalIdx: number
  segment: number
  count?: number
  usages?: any[]
}

export const createUnifiedSteps = (
  displayActivities: string[],
  toolSteps: any[],
  humanizeToolNameFn: (name: string) => string
): UnifiedStep[] => {
  const rawSteps: UnifiedStep[] = []

  const memoryActivities = displayActivities.filter((a) => a.toLowerCase().includes('memória:'))
  memoryActivities.forEach((act, originalIdx) => {
    rawSteps.push({
      isMemory: true,
      name: act
        .replace(/memória:/i, '')
        .replace(/\.\.\.$/, '')
        .trim(),
      originalIdx,
      status: 'done',
      segment: 0
    })
  })

  toolSteps.forEach((step, originalIdx) => {
    let isSkill = false
    let displayName = String(step.name || step.tool || 'tool')
    const description = minimizeText(step.description || step.detail || '')

    if (displayName === 'activate_skill') {
      isSkill = true
      try {
        const parsedQuery = JSON.parse(step.query)
        displayName = `Lendo habilidade de ${parsedQuery.skill_id}`
      } catch {
        displayName = 'Adquirindo nova habilidade'
      }
    } else {
      displayName = humanizeToolNameFn(displayName)
    }

    rawSteps.push({
      isMemory: false,
      name: displayName,
      description,
      rawName: step.name,
      isSkill,
      step,
      status: step.status,
      originalIdx,
      segment: step.segment || 0
    })
  })

  const grouped: UnifiedStep[] = []
  for (const item of rawSteps) {
    if (grouped.length === 0) {
      grouped.push({ ...item, count: 1, usages: item.isMemory ? [] : [item.step] })
      continue
    }
    const last = grouped[grouped.length - 1]
    if (
      !item.isMemory &&
      !last.isMemory &&
      item.name === last.name &&
      item.segment === last.segment
    ) {
      last.count = (last.count || 1) + 1
      last.usages = [...(last.usages || []), item.step]
      if (item.status === 'running') last.status = 'running'
    } else {
      grouped.push({ ...item, count: 1, usages: item.isMemory ? [] : [item.step] })
    }
  }

  return grouped
}
