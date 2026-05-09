const fs = require('node:fs')
const { store } = require('./shared-state')
const { isoNow, parseTime } = require('../utils/time')
const { debug } = require('../infrastructure/logger')
const { STORE_FILE } = require('../config/constants')

let _saveTimer = null

function saveStore() {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
    } catch (error) {
      debug('[NodeCore] Failed to save store:', error)
    }
  }, 2000)
}

function normalizeReminder(input) {
  return {
    id: input.id,
    title: String(input.title || 'Lembrete'),
    content: input.content || '',
    scheduled_time: input.scheduled_time || isoNow(),
    repeat_interval: input.repeat_interval ?? null,
    repeat_value: input.repeat_value ?? null,
    repeat_count: input.repeat_count ?? null,
    trigger_count: input.trigger_count ?? 0,
    is_active: input.is_active ?? true,
    note_id: input.note_id ?? null,
    action_type: input.action_type || 'reminder',
    voice_response: input.voice_response ?? true
  }
}

function advanceReminder(reminder) {
  const value = reminder.repeat_value || 1
  const current = new Date(reminder.scheduled_time)

  if (!Number.isFinite(current.getTime())) {
    reminder.is_active = false
    return
  }

  if (!reminder.repeat_interval) {
    reminder.is_active = false
    return
  }

  reminder.trigger_count = (reminder.trigger_count || 0) + 1

  if (reminder.repeat_count != null && reminder.trigger_count >= reminder.repeat_count) {
    reminder.is_active = false
    return
  }

  if (reminder.repeat_interval === 'minutes') current.setMinutes(current.getMinutes() + value)
  else if (reminder.repeat_interval === 'hours') current.setHours(current.getHours() + value)
  else if (reminder.repeat_interval === 'days') current.setDate(current.getDate() + value)
  else if (reminder.repeat_interval === 'weeks') current.setDate(current.getDate() + value * 7)
  else if (reminder.repeat_interval === 'months') current.setMonth(current.getMonth() + value)
  else reminder.is_active = false

  reminder.scheduled_time = current.toISOString()
}

function catchUpReminders() {
  const now = Date.now()
  let touched = false
  for (const reminder of store.reminders) {
    if (reminder.is_active && parseTime(reminder.scheduled_time) < now) {
      debug(`[Reminders] Skipping missed reminder on startup: ${reminder.title}`)
      while (reminder.is_active && parseTime(reminder.scheduled_time) < now) {
        advanceReminder(reminder)
      }
      touched = true
    }
  }
  if (touched) saveStore()
}

function parseRelativeReminder(content) {
  const text = String(content || '').toLowerCase()
  let at = new Date()

  const relativePatterns = [
    { regex: /\bhoje\b/i, adjust: () => {} },
    { regex: /\bamanha\b|\bamanhã\b/i, adjust: () => at.setDate(at.getDate() + 1) },
    { regex: /\bem\s+(\d+)\s*(minuto|minutos)\b/i, adjust: () => {} },
    { regex: /\bem\s+(\d+)\s*(hora|horas)\b/i, adjust: () => {} },
    { regex: /\bem\s+(\d+)\s*(dia|dias)\b/i, adjust: () => {} },
    { regex: /\bdaqui\s+a?\s+(\d+)\s*(minuto|minutos|hora|horas|dia|dias)\b/i, adjust: () => {} }
  ]

  for (const p of relativePatterns) {
    const m = text.match(p.regex)
    if (m && m[1] && /em\s+(\d+)/.test(p.regex.source)) {
      const qty = Number(m[1])
      if (Number.isFinite(qty) && qty > 0) {
        if (/minuto/i.test(p.regex.source)) at.setMinutes(at.getMinutes() + qty)
        else if (/hora/i.test(p.regex.source)) at.setHours(at.getHours() + qty)
        else at.setDate(at.getDate() + qty)
        return validDateCheck(at)
      }
    } else {
      p.adjust.call(at)
      return validDateCheck(at)
    }
  }

  const timePatterns = [
    {
      regex: /\b[a\u00e1]s?\s+(\d{1,2})h\b/i,
      parse: (h) => {
        at.setHours(Number(h), 0, 0, 0)
      }
    },
    {
      regex: /\b[a\u00e1]s?\s+(\d{1,2}):(\d{2})\b/i,
      parse: (h, m) => {
        at.setHours(Number(h), Number(m), 0, 0)
      }
    },
    {
      regex: /\b(\d{1,2})h\b/i,
      parse: (h) => {
        at.setHours(Number(h), 0, 0, 0)
      }
    },
    {
      regex: /\b(\d{1,2}):(\d{2})\b/i,
      parse: (h, m) => {
        at.setHours(Number(h), Number(m), 0, 0)
      }
    }
  ]

  const dayRef = /\bamanha\b|\bamanh\u00e3\b/i.test(text) ? 1 : /\bhoje\b/i.test(text) ? 0 : 0

  for (const p of timePatterns) {
    const m = text.match(p.regex)
    if (m && m[1]) {
      if (dayRef > 0) at.setDate(at.getDate() + dayRef)
      if (m[2]) p.parse(at, m[1], m[2])
      else p.parse(at, m[1])
      return validDateCheck(at)
    }
  }

  return validDateCheck(at)
}

function validDateCheck(date) {
  const d = new Date(date)
  if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now() + 60000) {
    d.setTime(Date.now() + 60 * 60 * 1000)
  }
  return d.toISOString()
}

function extractReminderTitle(text) {
  const raw = String(text || '').trim()
  if (!raw) return 'Lembrete'

  let cleaned = raw
    .replace(/^me\s+lembre\s+(de\s+)?/i, '')
    .replace(/^lembre(?:-me)?\s+(?:de\s+)?/i, '')
    .replace(/^agenda[rr]?\s+(?:para\s+)?/i, '')
    .replace(/^preciso\s+lembrar\s+(?:de\s+)?/i, '')
    .replace(/\bhoje\b|\bamanha\b|\bamanhã\b|\bás?\s+\d+|às?\s+\d+/gi, '')
    .replace(/\bdaqui\s+a?\s+\d+\s*(minuto|hora|dia)s?\b/gi, '')
    .replace(/\bem\s+\d+\s*(minuto|hora|dia)s?\b/gi, '')
    .replace(/\bno\s+(dia|horário|horas)\b/gi, '')
    .replace(/\bpara\s+(hoje|amanhã)\b/gi, '')
    .replace(/\bás?\s+\d{1,2}(h|:)\d{0,2}\b/gi, '')
    .replace(/\b\d{1,2}(h|:)\d{2}\b/gi, '')
    .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'Lembrete'
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 60) + '...'

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

module.exports = {
  normalizeReminder,
  advanceReminder,
  catchUpReminders,
  parseRelativeReminder,
  validDateCheck,
  extractReminderTitle
}
