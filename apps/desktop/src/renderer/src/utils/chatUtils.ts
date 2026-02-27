import { Message } from '../services/api'

export const toolTracePrefix = 'TOOL_TRACE::'
export const toolTraceTextDelimiter = '\n\nTOOL_TEXT::\n'

export const isToolTraceMessage = (msg?: Message) =>
  !!msg && msg.role === 'assistant' && msg.content.startsWith(toolTracePrefix)

export const splitToolTraceContent = (content: string) => {
  if (!content.startsWith(toolTracePrefix)) return null
  const idx = content.indexOf(toolTraceTextDelimiter)
  const jsonPart =
    idx >= 0 ? content.slice(toolTracePrefix.length, idx) : content.slice(toolTracePrefix.length)
  const textPart = idx >= 0 ? content.slice(idx + toolTraceTextDelimiter.length) : ''
  return { jsonPart, textPart }
}

export const buildToolTraceContent = (traceData: any, text: string) => {
  return `${toolTracePrefix}${JSON.stringify(traceData)}${toolTraceTextDelimiter}${text || ''}`
}

export const parseStructuredToolResult = (value: any) => {
  if (value === undefined || value === null) return { result: '', error: '' }

  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return { result: value, error: '' }
    }
  }

  if (parsed && typeof parsed === 'object' && 'status' in parsed) {
    if (parsed.status === 'error') {
      const errMessage = parsed.error?.message || parsed.error?.code || 'Erro de ferramenta'
      return { result: '', error: String(errMessage) }
    }
    const resultValue = parsed.result
    if (typeof resultValue === 'string') return { result: resultValue, error: '' }
    try {
      return { result: JSON.stringify(resultValue, null, 2), error: '' }
    } catch {
      return { result: String(resultValue ?? ''), error: '' }
    }
  }

  if (typeof parsed === 'string') return { result: parsed, error: '' }
  try {
    return { result: JSON.stringify(parsed, null, 2), error: '' }
  } catch {
    return { result: String(parsed), error: '' }
  }
}

export const extractToolQuery = (args: any): string | undefined => {
  if (!args || typeof args !== 'object') return undefined
  const candidates = ['query', 'q', 'text', 'content', 'prompt', 'message', 'input']
  for (const key of candidates) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

export const findLastAssistantIndex = (list: Message[]) => {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].role === 'assistant') return i
  }
  return -1
}

export const createAssistantMessageId = () =>
  `assistant:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

export const toCompactJson = (obj: any) => {
  if (obj === undefined || obj === null) return undefined
  try {
    return JSON.stringify(obj)
  } catch {
    return String(obj)
  }
}
