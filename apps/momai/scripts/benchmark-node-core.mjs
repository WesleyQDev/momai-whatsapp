#!/usr/bin/env node
/* eslint-disable no-console */
const API = process.env.MOMAI_BENCHMARK_API || 'http://127.0.0.1:8000'
const THREAD_ID = process.env.MOMAI_BENCHMARK_THREAD || 'benchmark'
const RUNS = Number(process.env.MOMAI_BENCHMARK_RUNS || 8)

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[idx] * 100) / 100
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 280)}`)
  }
  return response
}

async function streamChat(content) {
  const started = Date.now()
  const response = await postJson(`${API}/chat/stream`, { thread_id: THREAD_ID, content })
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let firstTokenAt = 0
  let totalTokens = 0
  if (!reader) throw new Error('No stream body available')

  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.replace(/^data:\s*/, '')
      try {
        const data = JSON.parse(payload)
        if (data.token) {
          totalTokens += 1
          if (!firstTokenAt) firstTokenAt = Date.now()
        }
      } catch {}
    }
  }

  const finished = Date.now()
  return {
    totalMs: finished - started,
    firstTokenMs: firstTokenAt ? firstTokenAt - started : finished - started,
    tokens: totalTokens
  }
}

async function main() {
  const scenarios = [
    { name: 'chat_puro', prompt: 'Explique em 3 linhas o que é computação local.' },
    { name: 'chat_memoria', prompt: 'Resuma minhas notas sobre projetos recentes.' },
    { name: 'chat_skill', prompt: 'me lembre em 10 minutos de revisar e-mails.' }
  ]

  const report = []
  for (const scenario of scenarios) {
    const totals = []
    const firsts = []
    for (let i = 0; i < RUNS; i += 1) {
      const run = await streamChat(scenario.prompt)
      totals.push(run.totalMs)
      firsts.push(run.firstTokenMs)
    }
    report.push({
      scenario: scenario.name,
      runs: RUNS,
      total_p50_ms: percentile(totals, 50),
      total_p95_ms: percentile(totals, 95),
      first_token_p50_ms: percentile(firsts, 50),
      first_token_p95_ms: percentile(firsts, 95)
    })
  }

  console.log(JSON.stringify({ api: API, thread_id: THREAD_ID, report }, null, 2))
}

main().catch((error) => {
  console.error('[benchmark-node-core] failed:', error.message)
  process.exit(1)
})
