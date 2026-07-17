import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.resolve(__dirname, '..', '..', '..', 'apps', 'core', 'models')
const BENCH_PORT = 8199
const BENCH_HOST = '127.0.0.1'
const BENCH_URL = `http://${BENCH_HOST}:${BENCH_PORT}`
const LLAMA_SERVER = path.resolve(__dirname, '..', 'bin', 'llama', 'cpu', 'llama-server.exe')
const RESULTS_FILE = path.resolve(__dirname, 'benchmark-results.json')

const QUERIES = [
  { name: 'curta (2 palavras)', text: 'inteligência artificial' },
  {
    name: 'média (8 palavras)',
    text: 'como funciona a memória semântica do assistente virtual local'
  },
  {
    name: 'longa (20 palavras)',
    text: 'quais são as melhores práticas para implementar busca semântica em aplicações desktop com modelos de embedding rodando localmente no computador'
  },
  {
    name: 'multi-idioma',
    text: 'machine learning and natural language processing with semantic search and retrieval augmented generation for local first applications'
  },
  {
    name: 'técnica',
    text: 'LanceDB vector database similarity search with cosine distance embedding model quantization GGUF llama.cpp inference server'
  }
]

function log(msg) {
  console.log(`[benchmark] ${msg}`)
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function p95(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.95) - 1
  return sorted[Math.max(0, idx)]
}

function p99(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.99) - 1
  return sorted[Math.max(0, idx)]
}

function stddev(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const sq = arr.map((v) => (v - m) ** 2)
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / (arr.length - 1))
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      })
      if (resp.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

async function embedQuery(text, url, signal) {
  const start = Date.now()
  const resp = await fetch(`${url}/embedding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text.toLowerCase().trim() }),
    signal: signal || AbortSignal.timeout(15000)
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  const elapsed = Date.now() - start
  let vector = null
  if (data?.data?.[0]?.embedding) vector = data.data[0].embedding
  else if (data?.embedding) vector = data.embedding
  return { elapsed, vectorLength: vector?.length || 0, vector }
}

async function warmupServer(url, count = 3) {
  for (let i = 0; i < count; i++) {
    try {
      await embedQuery('warmup request to initialize model', url)
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
}

async function runBenchmark(modelPath, modelLabel) {
  return new Promise(async (resolve, reject) => {
    log(`Starting benchmark for: ${modelLabel}`)
    log(`Model: ${modelPath}`)
    log(`Server: ${LLAMA_SERVER}`)

    // Get model file size
    let modelSizeMb = 0
    try {
      const { statSync } = await import('node:fs')
      modelSizeMb = Math.round(statSync(modelPath).size / (1024 * 1024))
    } catch {}

    const results = {
      model: modelLabel,
      model_path: modelPath,
      model_size_mb: modelSizeMb,
      model_params: modelLabel.includes('0.6B') ? '0.6B' : '0.35B',
      quantization: 'Q8_0',
      timestamp: new Date().toISOString(),
      cold_start_ms: null,
      warm_start_ms: null,
      queries: {},
      summary: null
    }

    // Kill any process on our port first
    try {
      await fetch(`${BENCH_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(500) })
      log('WARNING: Something is already running on the bench port! Will try to continue...')
    } catch {}

    // Start llama-server
    const proc = spawn(
      LLAMA_SERVER,
      [
        '-m',
        modelPath,
        '--port',
        String(BENCH_PORT),
        '--embedding',
        '--pooling',
        'last',
        '--parallel',
        '2',
        '--ctx-size',
        '2048',
        '--threads',
        '4',
        '-ngl',
        '0'
      ],
      {
        cwd: path.dirname(LLAMA_SERVER),
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    let stdoutData = ''
    let stderrData = ''
    proc.stdout.on('data', (d) => {
      stdoutData += String(d)
    })
    proc.stderr.on('data', (d) => {
      stderrData += String(d)
    })

    log(`Server PID: ${proc.pid}`)

    // Wait for server ready
    const serverReady = await waitForServer(BENCH_URL)
    if (!serverReady) {
      log('ERROR: Server failed to start')
      proc.kill()
      reject(new Error('Server startup failed'))
      return
    }

    // Cold start: first request after server starts
    log('--- Cold start ---')
    await new Promise((r) => setTimeout(r, 100))
    const coldResult = await embedQuery('cold start test query', BENCH_URL)
    results.cold_start_ms = coldResult.elapsed
    log(`Cold start: ${coldResult.elapsed}ms`)

    // Warmup
    log('--- Warmup ---')
    await warmupServer(BENCH_URL, 5)

    // Warm start: single request after warmup
    const warmResult = await embedQuery('warm start test query', BENCH_URL)
    results.warm_start_ms = warmResult.elapsed
    log(`Warm start: ${warmResult.elapsed}ms`)

    // Run benchmarks for each query type
    log('--- Query benchmarks ---')
    for (const q of QUERIES) {
      log(`  Query: ${q.name} ("${q.text.slice(0, 50)}...")`)
      const latencies = []
      const runs = 10
      for (let i = 0; i < runs; i++) {
        try {
          const { elapsed } = await embedQuery(q.text, BENCH_URL)
          latencies.push(elapsed)
        } catch (err) {
          log(`    Run ${i + 1} failed: ${err.message}`)
        }
        // Small delay between runs
        await new Promise((r) => setTimeout(r, 50))
      }

      results.queries[q.name] = {
        text: q.text,
        text_length: q.text.length,
        runs,
        min_ms: Math.min(...latencies),
        max_ms: Math.max(...latencies),
        mean_ms: Math.round(mean(latencies) * 100) / 100,
        median_ms: Math.round(median(latencies) * 100) / 100,
        p95_ms: Math.round(p95(latencies) * 100) / 100,
        p99_ms: Math.round(p99(latencies) * 100) / 100,
        stddev_ms: Math.round(stddev(latencies) * 100) / 100,
        all_ms: latencies
      }

      log(
        `      mean=${results.queries[q.name].mean_ms}ms median=${results.queries[q.name].median_ms}ms p95=${results.queries[q.name].p95_ms}ms`
      )
    }

    // Calculate overall summary for warm queries
    const allQueryLatencies = Object.values(results.queries).flatMap((q) => q.all_ms || [])
    results.summary = {
      total_queries_measured: allQueryLatencies.length,
      overall_mean_ms: Math.round(mean(allQueryLatencies) * 100) / 100,
      overall_median_ms: Math.round(median(allQueryLatencies) * 100) / 100,
      overall_p95_ms: Math.round(p95(allQueryLatencies) * 100) / 100,
      overall_p99_ms: Math.round(p99(allQueryLatencies) * 100) / 100,
      overall_min_ms: Math.min(...allQueryLatencies),
      overall_max_ms: Math.max(...allQueryLatencies),
      overall_stddev_ms: Math.round(stddev(allQueryLatencies) * 100) / 100
    }

    // Cleanup
    log('--- Cleaning up ---')
    proc.kill('SIGTERM')
    setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {}
    }, 3000)

    resolve(results)
  })
}

async function main() {
  const args = process.argv.slice(2)
  const modelPath = args[0]

  if (!modelPath) {
    console.error('Usage: node benchmark-embedding.mjs <path-to-gguf>')
    console.error('')
    console.error('Available models:')
    const modelsDir = MODELS_DIR
    if (existsSync(modelsDir)) {
      const { readdirSync } = await import('node:fs')
      const files = readdirSync(modelsDir).filter((f) => f.endsWith('.gguf'))
      for (const f of files) {
        console.error(`  ${path.join(modelsDir, f)}`)
      }
    }
    process.exit(1)
  }

  if (!existsSync(modelPath)) {
    console.error(`Model not found: ${modelPath}`)
    process.exit(1)
  }

  const modelLabel = path.basename(modelPath).replace('.gguf', '')
  const results = await runBenchmark(modelPath, modelLabel)

  // Save results
  const existing = {}
  try {
    if (existsSync(RESULTS_FILE)) {
      const content = readFileSync(RESULTS_FILE, 'utf-8')
      Object.assign(existing, JSON.parse(content))
    }
  } catch {}
  existing[modelLabel] = results
  writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2), 'utf-8')

  // Print summary
  console.log('')
  console.log('='.repeat(60))
  console.log('BENCHMARK RESULTS')
  console.log('='.repeat(60))
  console.log(`Model: ${results.model}`)
  console.log(
    `Size: ${results.model_size_mb}MB | Params: ${results.model_params} | Quant: ${results.quantization}`
  )
  console.log('')
  console.log(`Cold start (first request): ${results.cold_start_ms}ms`)
  console.log(`Warm start (after warmup):  ${results.warm_start_ms}ms`)
  console.log('')
  console.log('Query benchmarks (10 runs each, warm cache):')
  console.log(
    `${'Query'.padEnd(25)} ${'Mean'.padEnd(10)} ${'Median'.padEnd(10)} ${'P95'.padEnd(10)} ${'Min'.padEnd(10)} ${'Max'.padEnd(10)} ${'StdDev'.padEnd(10)}`
  )
  console.log('-'.repeat(85))
  for (const [name, q] of Object.entries(results.queries)) {
    console.log(
      `${name.padEnd(25)} ${String(q.mean_ms).padEnd(10)} ${String(q.median_ms).padEnd(10)} ${String(q.p95_ms).padEnd(10)} ${String(q.min_ms).padEnd(10)} ${String(q.max_ms).padEnd(10)} ${String(q.stddev_ms).padEnd(10)}`
    )
  }
  console.log('')
  console.log('Overall:')
  const s = results.summary
  console.log(
    `  Mean: ${s.overall_mean_ms}ms | Median: ${s.overall_median_ms}ms | P95: ${s.overall_p95_ms}ms | P99: ${s.overall_p99_ms}ms`
  )
  console.log(
    `  Min: ${s.overall_min_ms}ms | Max: ${s.overall_max_ms}ms | StdDev: ${s.overall_stddev_ms}ms`
  )
  console.log(`  Total queries measured: ${s.total_queries_measured}`)
  console.log('')
  console.log(`Results saved to: ${RESULTS_FILE}`)
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
