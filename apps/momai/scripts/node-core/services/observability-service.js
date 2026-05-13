const fs = require('node:fs')
const path = require('node:path')
const { info } = require('../infrastructure/logger')

const DATA_DIR = process.env.MOMAI_NODE_CORE_DATA_DIR || path.join(process.cwd(), 'data')
const METRICS_FILE = path.join(DATA_DIR, 'observability-metrics.json')
let metricsCache = null
let saveTimer = null

function getMetricsPath() {
  return METRICS_FILE
}

function loadMetrics() {
  if (metricsCache) return metricsCache
  try {
    if (fs.existsSync(METRICS_FILE)) {
      const raw = fs.readFileSync(METRICS_FILE, 'utf8')
      metricsCache = JSON.parse(raw)
      if (!Array.isArray(metricsCache)) metricsCache = []
    } else {
      metricsCache = []
    }
  } catch {
    metricsCache = []
  }
  return metricsCache
}

function saveMetrics() {
  try {
    const dir = path.dirname(METRICS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metricsCache), 'utf8')
  } catch (_) { /* ignore */ }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveMetrics(); saveTimer = null }, 2000)
}

function recordMetric(trace) {
  const metrics = loadMetrics()
  metrics.push({
    timestamp: trace.timestamp || Date.now(),
    duration_ms: trace.total_duration || 0,
    tokens_per_second: trace.tokens_per_second || 0,
    total_tokens: trace.total_tokens || 0,
    generated_tokens: trace.generated_tokens || 0,
    estimated_prompt_tokens: trace.estimated_prompt_tokens || 0,
    model: trace.model || 'unknown',
    tier: trace.tier || 'unknown',
    type: trace.type || 'llm_call',
    status: trace.status || 'success'
  })
  if (metrics.length > 2000) metrics.splice(0, metrics.length - 2000)
  scheduleSave()
}

function computeStats() {
  const metrics = loadMetrics()
  const total = metrics.length
  if (total === 0) {
    return { total: 0, avg_tps: 0, avg_duration: 0, avg_tokens: 0, trend: null, recent: [], by_hour: [] }
  }

  const avgTps = +(metrics.reduce((s, m) => s + m.tokens_per_second, 0) / total).toFixed(2)
  const avgDur = +(metrics.reduce((s, m) => s + m.duration_ms, 0) / total).toFixed(0)
  const avgTok = +(metrics.reduce((s, m) => s + m.total_tokens, 0) / total).toFixed(0)

  // Trend: last 10 vs 10 before that
  const last10 = metrics.slice(-10)
  const prev10 = metrics.slice(-20, -10)
  let trend = null
  if (last10.length >= 3 && prev10.length >= 3) {
    const lastAvg = last10.reduce((s, m) => s + m.tokens_per_second, 0) / last10.length
    const prevAvg = prev10.reduce((s, m) => s + m.tokens_per_second, 0) / prev10.length
    const diff = +((lastAvg - prevAvg) / prevAvg * 100).toFixed(1)
    trend = {
      recent_avg_tps: +lastAvg.toFixed(2),
      previous_avg_tps: +prevAvg.toFixed(2),
      change_pct: diff,
      improving: diff > 0
    }
  }

  // By hour (last 24h)
  const now = Date.now()
  const dayAgo = now - 86400000
  const recent = metrics.filter(m => m.timestamp > dayAgo)
  const byHour = []
  for (let h = 23; h >= 0; h--) {
    const start = now - (h + 1) * 3600000
    const end = now - h * 3600000
    const slice = recent.filter(m => m.timestamp >= start && m.timestamp < end)
    if (slice.length > 0) {
      byHour.push({
        hour: new Date(start).toLocaleTimeString('pt-BR', { hour: '2-digit' }),
        count: slice.length,
        avg_tps: +(slice.reduce((s, m) => s + m.tokens_per_second, 0) / slice.length).toFixed(1)
      })
    }
  }

  return {
    total,
    avg_tps: avgTps,
    avg_duration: +avgDur,
    avg_tokens: +avgTok,
    trend,
    recent: metrics.slice(-50).map(m => ({
      tps: m.tokens_per_second,
      duration_ms: m.duration_ms,
      timestamp: m.timestamp
    })),
    by_hour: byHour
  }
}

module.exports = { recordMetric, computeStats, loadMetrics, getMetricsPath }
