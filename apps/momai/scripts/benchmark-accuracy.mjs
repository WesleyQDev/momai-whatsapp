import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.resolve(__dirname, '..', '..', '..', 'apps', 'core', 'models')
const BENCH_PORT = 8198
const BENCH_URL = `http://127.0.0.1:${BENCH_PORT}`
const LLAMA_SERVER = path.resolve(__dirname, '..', 'bin', 'llama', 'cpu', 'llama-server.exe')
const RESULTS_FILE = path.resolve(__dirname, 'benchmark-accuracy-results.json')

// ============================================================
// TEST CORPORA: Documentos + Queries com ground truth
// ============================================================

const DOCUMENTS = [
  // Tecnologia / Programação
  { id: 'doc_tech_01', text: 'Python é uma linguagem de programação de alto nível amplamente usada em ciência de dados, machine learning e desenvolvimento web. Sua sintaxe simples e legibilidade a tornam ideal para iniciantes.' },
  { id: 'doc_tech_02', text: 'TypeScript é um superset do JavaScript que adiciona tipagem estática opcional. É mantido pela Microsoft e amplamente usado em grandes aplicações web e mobile.' },
  { id: 'doc_tech_03', text: 'React é uma biblioteca JavaScript para construir interfaces de usuário. Desenvolvida pelo Meta, é uma das ferramentas front-end mais populares do mundo.' },
  { id: 'doc_tech_04', text: 'Node.js é um runtime JavaScript assíncrono orientado a eventos, projetado para construir aplicações de rede escaláveis. Usa o motor V8 do Chrome.' },
  { id: 'doc_tech_05', text: 'LanceDB é um banco de dados vetorial open-source escrito em Rust. É projetado para busca de similaridade em alta dimensão e integração com LLMs.' },
  { id: 'doc_tech_06', text: 'Llama.cpp é uma biblioteca C++ para inferência de modelos de linguagem em CPUs e GPUs. Suporta quantização GGUF e é usada para rodar LLMs localmente.' },
  { id: 'doc_tech_07', text: 'O protocolo HTTP/2 permite multiplexação de requisições, compressão de headers e server push, melhorando significativamente a performance de aplicações web.' },

  // Culinária
  { id: 'doc_food_01', text: 'Feijoada é um prato típico brasileiro feito com feijão preto e carnes de porco. É servida com arroz, couve refogada e farofa. Originalmente criada nas senzalas.' },
  { id: 'doc_food_02', text: 'Pizza napolitana tem massa fina e bordas altas. Os ingredientes clássicos incluem molho de tomate San Marzano, mussarela de búfala e manjericão fresco.' },
  { id: 'doc_food_03', text: 'Sushi é um prato japonês que combina arroz temperado com vinagre, peixe cru e vegetais. Existem variações como nigiri, maki e temaki.' },
  { id: 'doc_food_04', text: 'Brigadeiro é um doce brasileiro feito com leite condensado, chocolate em pó e manteiga. É enrolado em bolinhas e coberto com granulado. Presente em todas as festas.' },
  { id: 'doc_food_05', text: 'O azeite de oliva extra virgem é rico em antioxidantes e gorduras monoinsaturadas. É obtido da prensagem a frio de azeitonas selecionadas.' },

  // Viagem / Geografia
  { id: 'doc_travel_01', text: 'Paris é a capital da França, conhecida como a Cidade Luz. Abriga a Torre Eiffel, o Museu do Louvre e a Catedral de Notre-Dame. É um dos destinos turísticos mais visitados do mundo.' },
  { id: 'doc_travel_02', text: 'O Rio de Janeiro é uma cidade brasileira famosa pelo Cristo Redentor, Pão de Açúcar e praias como Copacabana e Ipanema. Sedia o maior carnaval do mundo.' },
  { id: 'doc_travel_03', text: 'Tóquio é a capital do Japão, uma metrópole que combina tradição e modernidade. Tem templos centenários, bairros futuristas como Shibuya e uma gastronomia renomada.' },
  { id: 'doc_travel_04', text: 'Fernando de Noronha é um arquipélago brasileiro com praias paradisíacas e águas cristalinas. É considerado Patrimônio Natural da UNESCO e um dos melhores destinos de mergulho do mundo.' },

  // Saúde / Bem-estar
  { id: 'doc_health_01', text: 'A meditação mindfulness reduz o estresse e melhora a concentração. A prática regular de 10 minutos por dia pode trazer benefícios significativos para a saúde mental.' },
  { id: 'doc_health_02', text: 'O jejum intermitente alterna períodos de alimentação com períodos de jejum. Estudos mostram benefícios para perda de peso, sensibilidade à insulina e longevidade.' },
  { id: 'doc_health_03', text: 'O chá verde é rico em catequinas e cafeína. Seus antioxidantes ajudam na prevenção de doenças cardiovasculares e no metabolismo de gorduras.' },
  { id: 'doc_health_04', text: 'A vitamina D é essencial para a absorção de cálcio e saúde óssea. A principal fonte é a exposição solar moderada, mas também é encontrada em peixes gordurosos.' },

  // Finanças
  { id: 'doc_finance_01', text: 'Bitcoin é a primeira criptomoeda descentralizada, criada em 2009 por Satoshi Nakamoto. Opera em uma rede blockchain peer-to-peer sem autoridade central.' },
  { id: 'doc_finance_02', text: 'O Tesouro Direto é um programa do governo brasileiro que permite investir em títulos públicos federais. É considerado um dos investimentos mais seguros do país.' },
  { id: 'doc_finance_03', text: 'Ações são frações do capital social de uma empresa. Investir em ações oferece potencial de valorização e dividendos, mas envolve riscos de mercado.' },

  // Natureza / Ciência
  { id: 'doc_science_01', text: 'A fotossíntese é o processo pelo qual plantas convertem luz solar em energia química. Produzem glicose e oxigênio a partir de CO2 e água.' },
  { id: 'doc_science_02', text: 'O aquecimento global é causado pelo aumento de gases de efeito estufa na atmosfera. Suas consequências incluem derretimento das calotas polares e elevação do nível do mar.' },
  { id: 'doc_science_03', text: 'Inteligência Artificial é a simulação de processos de inteligência humana por sistemas computacionais. Inclui aprendizado de máquina, processamento de linguagem natural e visão computacional.' },
]

const QUERIES = [
  // Queries em Português
  { id: 'q_pt_01', text: 'qual linguagem usar para machine learning', relevant: ['doc_tech_01', 'doc_tech_04', 'doc_science_03'], category: 'pt' },
  { id: 'q_pt_02', text: 'como fazer busca em vetores', relevant: ['doc_tech_05', 'doc_tech_06'], category: 'pt' },
  { id: 'q_pt_03', text: 'prato típico brasileiro com feijão', relevant: ['doc_food_01', 'doc_food_04'], category: 'pt' },
  { id: 'q_pt_04', text: 'doces para festa infantil', relevant: ['doc_food_04'], category: 'pt' },
  { id: 'q_pt_05', text: 'melhores praias do Brasil para mergulho', relevant: ['doc_travel_04', 'doc_travel_02'], category: 'pt' },
  { id: 'q_pt_06', text: 'como reduzir estresse e ansiedade', relevant: ['doc_health_01', 'doc_health_03'], category: 'pt' },
  { id: 'q_pt_07', text: 'investimentos seguros no Brasil', relevant: ['doc_finance_02', 'doc_finance_03'], category: 'pt' },
  { id: 'q_pt_08', text: 'o que é blockchain e criptomoeda', relevant: ['doc_finance_01', 'doc_science_03'], category: 'pt' },
  { id: 'q_pt_09', text: 'programação web front-end', relevant: ['doc_tech_03', 'doc_tech_02', 'doc_tech_04'], category: 'pt' },
  { id: 'q_pt_10', text: 'cidades turísticas famosas mundo', relevant: ['doc_travel_01', 'doc_travel_02', 'doc_travel_03'], category: 'pt' },

  // Queries em Inglês (cross-lingual)
  { id: 'q_en_01', text: 'best JavaScript library for building user interfaces', relevant: ['doc_tech_03', 'doc_tech_02'], category: 'en' },
  { id: 'q_en_02', text: 'vector database for similarity search', relevant: ['doc_tech_05', 'doc_tech_06'], category: 'en' },
  { id: 'q_en_03', text: 'Japanese dish with rice and raw fish', relevant: ['doc_food_03'], category: 'en' },
  { id: 'q_en_04', text: 'vitamin for bone health and calcium absorption', relevant: ['doc_health_04'], category: 'en' },
  { id: 'q_en_05', text: 'decentralized cryptocurrency without central authority', relevant: ['doc_finance_01'], category: 'en' },
]

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function log(msg) {
  console.log(`[accuracy] ${msg}`)
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function mrr(results) {
  let sum = 0
  for (const r of results) {
    if (r.rank > 0) sum += 1 / r.rank
  }
  return sum / results.length
}

function recallAtK(results, k) {
  let sum = 0
  for (const r of results) {
    const found = r.topK.slice(0, k).some(d => r.relevant.includes(d))
    sum += found ? 1 : 0
  }
  return sum / results.length
}

function precisionAtK(results, k) {
  let sum = 0
  for (const r of results) {
    const found = r.topK.slice(0, k).filter(d => r.relevant.includes(d)).length
    sum += found / k
  }
  return sum / results.length
}

function ndcgAtK(results, k) {
  let sum = 0
  for (const r of results) {
    const relevances = r.topK.slice(0, k).map(d => r.relevant.includes(d) ? 1 : 0)
    let dcg = 0, idcg = 0
    for (let i = 0; i < k; i++) {
      const gain = relevances[i] || 0
      dcg += gain / Math.log2(i + 2)
      idcg += (i < r.relevant.length ? 1 : 0) / Math.log2(i + 2)
    }
    sum += idcg > 0 ? dcg / idcg : 0
  }
  return sum / results.length
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) })
      if (resp.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  return false
}

async function embed(text, url) {
  const resp = await fetch(`${url}/embedding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text.toLowerCase().trim() }),
    signal: AbortSignal.timeout(30000)
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  let vec = null
  // Formato: [{ "index": 0, "embedding": [[float...]] }]
  if (Array.isArray(data) && data[0] && Array.isArray(data[0].embedding)) {
    vec = data[0].embedding
  }
  // Desaninha: [[float...]] → [float...]
  while (Array.isArray(vec) && vec.length && Array.isArray(vec[0])) {
    vec = vec[0]
  }
  return vec
}

async function startServer(modelPath) {
  const proc = spawn(LLAMA_SERVER, [
    '-m', modelPath,
    '--port', String(BENCH_PORT),
    '--embedding',
    '--pooling', 'last',
    '--parallel', '1',
    '--ctx-size', '2048',
    '--threads', '4',
    '-ngl', '0'
  ], {
    cwd: path.dirname(LLAMA_SERVER),
    stdio: ['ignore', 'pipe', 'pipe']
  })

  log(`Server PID: ${proc.pid}`)
  const ready = await waitForServer(BENCH_URL)
  if (!ready) throw new Error('Server failed to start')
  log('Server ready')
  return proc
}

async function stopServer(proc) {
  proc.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 1000))
  try { proc.kill('SIGKILL') } catch {}
}

// ============================================================
// BENCHMARK RUNNER
// ============================================================

async function runAccuracyBenchmark(modelPath, modelLabel, usePrefixes = false) {
  log(`\n${'='.repeat(60)}`)
  log(`Benchmark: ${modelLabel}`)
  log(`Prefixes: ${usePrefixes}`)
  log(`${'='.repeat(60)}`)

  let modelSizeMb = 0
  try {
    const { statSync } = await import('node:fs')
    modelSizeMb = Math.round(statSync(modelPath).size / (1024 * 1024))
  } catch {}

  const proc = await startServer(modelPath)

  // Warmup
  log('Warming up...')
  for (let i = 0; i < 3; i++) {
    await embed('warmup query', BENCH_URL).catch(() => {})
  }

  // Embed all documents
  log('Embedding documents...')
  const docVectors = []
  for (const doc of DOCUMENTS) {
    const prefix = usePrefixes ? 'document: ' : ''
    const vec = await embed(prefix + doc.text, BENCH_URL)
    docVectors.push({ id: doc.id, text: doc.text, vector: vec })
  }
  log(`  ${docVectors.length} documents embedded`)

  // Embed all queries and rank
  log('Running queries...')
  const results = []
  for (const q of QUERIES) {
    const prefix = usePrefixes ? 'query: ' : ''
    const qVec = await embed(prefix + q.text, BENCH_URL)
    if (!qVec) continue

    // Score all documents
    const scored = docVectors.map(d => ({
      id: d.id,
      score: cosineSimilarity(qVec, d.vector)
    }))
    scored.sort((a, b) => b.score - a.score)

    const top10 = scored.slice(0, 10)
    const rank = top10.findIndex(d => q.relevant.includes(d.id)) + 1

    results.push({
      query_id: q.id,
      query_text: q.text,
      category: q.category,
      relevant: q.relevant,
      rank: rank > 0 ? rank : -1,
      topK: top10.map(d => d.id),
      topKScores: top10.map(d => Math.round(d.score * 10000) / 10000)
    })

    const status = rank > 0 ? `✅ #${rank}` : '❌ not found'
    log(`  ${q.id} (${q.category}): ${status}  | top: ${top10[0].id} (${Math.round(top10[0].score * 1000) / 1000}) | relevant: ${q.relevant.join(',')}`)
  }

  await stopServer(proc)

  // Compute metrics
  const ptResults = results.filter(r => r.category === 'pt')
  const enResults = results.filter(r => r.category === 'en')

  function computeMetrics(name, res) {
    if (!res.length) return null
    return {
      name,
      count: res.length,
      mrr: Math.round(mrr(res) * 10000) / 10000,
      recall_at_1: Math.round(recallAtK(res, 1) * 10000) / 10000,
      recall_at_3: Math.round(recallAtK(res, 3) * 10000) / 10000,
      recall_at_5: Math.round(recallAtK(res, 5) * 10000) / 10000,
      precision_at_1: Math.round(precisionAtK(res, 1) * 10000) / 10000,
      precision_at_3: Math.round(precisionAtK(res, 3) * 10000) / 10000,
      ndcg_at_5: Math.round(ndcgAtK(res, 5) * 10000) / 10000,
      avg_rank: Math.round(mean(res.filter(r => r.rank > 0).map(r => r.rank)) * 100) / 100,
      found_rate: Math.round((res.filter(r => r.rank > 0).length / res.length) * 10000) / 100,
      avg_top1_score: Math.round(mean(res.map(r => r.topKScores[0])) * 10000) / 10000,
    }
  }

  const overall = computeMetrics('overall', results)
  const pt = computeMetrics('português', ptResults)
  const en = computeMetrics('english', enResults)

  const summary = {
    model: modelLabel,
    model_path: modelPath,
    model_size_mb: modelSizeMb,
    model_params: modelLabel.includes('0.6B') ? '0.6B' : '0.35B',
    quantization: 'Q8_0',
    use_prefixes: usePrefixes,
    timestamp: new Date().toISOString(),
    num_docs: DOCUMENTS.length,
    num_queries: QUERIES.length,
    overall,
    portuguese: pt,
    english: en,
    per_query: results
  }

  return summary
}

// ============================================================
// REPORTING
// ============================================================

function printComparison(results) {
  console.log('\n' + '='.repeat(80))
  console.log('COMPARISON: ACCURACY BENCHMARK')
  console.log('='.repeat(80))

  const headers = ['Métrica', ...results.map(r => r.label)]
  console.log(headers.join(' | '))
  console.log('-'.repeat(80))

  const metrics = [
    ['MRR', ...results.map(r => r.data.overall?.mrr ?? '-')],
    ['Recall@1', ...results.map(r => r.data.overall?.recall_at_1 ?? '-')],
    ['Recall@3', ...results.map(r => r.data.overall?.recall_at_3 ?? '-')],
    ['Recall@5', ...results.map(r => r.data.overall?.recall_at_5 ?? '-')],
    ['Precision@1', ...results.map(r => r.data.overall?.precision_at_1 ?? '-')],
    ['NDCG@5', ...results.map(r => r.data.overall?.ndcg_at_5 ?? '-')],
    ['Found Rate (%)', ...results.map(r => r.data.overall?.found_rate ?? '-')],
    ['Avg Rank (when found)', ...results.map(r => r.data.overall?.avg_rank ?? '-')],
  ]

  for (const row of metrics) {
    console.log(row.join(' | '))
  }

  console.log('')
  console.log('--- Per Language ---')
  for (const lang of ['português', 'english']) {
    console.log(`\n${lang}:`)
    const key = lang === 'português' ? 'portuguese' : 'english'
    const langMetrics = [
      ['MRR', ...results.map(r => r.data[key]?.mrr ?? '-')],
      ['Recall@3', ...results.map(r => r.data[key]?.recall_at_3 ?? '-')],
      ['Found Rate (%)', ...results.map(r => r.data[key]?.found_rate ?? '-')],
    ]
    for (const row of langMetrics) {
      console.log(`  ${row.join(' | ')}`)
    }
  }
}

async function main() {
  const qwenModel = path.join(MODELS_DIR, 'Qwen3-Embedding-0.6B-Q8_0.gguf')
  const lfmModel = path.join(MODELS_DIR, 'LFM2.5-Embedding-350M-Q8_0.gguf')

  console.log('ACCURACY BENCHMARK FOR EMBEDDING MODELS')
  console.log('')
  console.log(`Documents: ${DOCUMENTS.length}`)
  console.log(`Queries: ${QUERIES.length} (${QUERIES.filter(q => q.category === 'pt').length} pt + ${QUERIES.filter(q => q.category === 'en').length} en)`)
  console.log('')

  const allResults = []

  // 1. Qwen3 (no prefixes - as currently used)
  log('\n>>> Qwen3 (sem prefixes)')
  const qwenResult = await runAccuracyBenchmark(qwenModel, 'Qwen3-Embedding-0.6B-Q8_0', false)
  allResults.push({ label: 'Qwen3 (sem prefix)', data: qwenResult })
  writeFileSync(RESULTS_FILE, JSON.stringify(qwenResult, null, 2))
  log(`Saved ${RESULTS_FILE}`)

  // 2. LFM2.5 (no prefixes - fair comparison, drop-in replacement)
  log('\n>>> LFM2.5 (sem prefixes)')
  const lfmNoPrefixResult = await runAccuracyBenchmark(lfmModel, 'LFM2.5-Embedding-350M-Q8_0', false)
  allResults.push({ label: 'LFM2.5 (sem prefix)', data: lfmNoPrefixResult })

  // 3. LFM2.5 (with prefixes - optimal usage)
  log('\n>>> LFM2.5 (com prefixes)')
  const lfmPrefixResult = await runAccuracyBenchmark(lfmModel, 'LFM2.5-Embedding-350M-Q8_0', true)
  allResults.push({ label: 'LFM2.5 (query:/document:)', data: lfmPrefixResult })

  // Final comparison
  printComparison(allResults)

  // Save combined results
  const combined = {
    timestamp: new Date().toISOString(),
    corpora: { num_docs: DOCUMENTS.length, num_queries: QUERIES.length },
    results: allResults.map(r => ({ label: r.label, data: r.data }))
  }
  writeFileSync(RESULTS_FILE, JSON.stringify(combined, null, 2))
  log(`\nFull results saved to: ${RESULTS_FILE}`)
}

main().catch(err => {
  console.error('FAILED:', err)
  process.exit(1)
})
