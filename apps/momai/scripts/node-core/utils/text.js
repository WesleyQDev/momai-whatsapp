const crypto = require('node:crypto')

function sha1(text) {
  return crypto
    .createHash('sha1')
    .update(String(text || ''), 'utf8')
    .digest('hex')
}

function splitTokens(text) {
  return text.match(/\S+\s*/g) || [text]
}

function sanitizePromptText(text) {
  return String(text || '')
    .replace(/\{\{/g, '(')
    .replace(/\}\}/g, ')')
    .replace(/[{}]/g, '')
}

function lexicalScore(source, query) {
  const src = String(source || '').toLowerCase()
  const q = String(query || '')
    .toLowerCase()
    .trim()
  if (!src || !q) return 0
  let idx = 0
  let count = 0
  while (idx >= 0) {
    idx = src.indexOf(q, idx)
    if (idx >= 0) {
      count += 1
      idx += Math.max(1, q.length)
    }
  }
  return count
}

/**
 * Executes promises with limited concurrency.
 */
async function promiseAllStep(limit, items, mapper) {
  const results = []
  const executing = new Set()
  for (const item of items) {
    const p = Promise.resolve().then(() => mapper(item))
    results.push(p)
    executing.add(p)
    const clean = () => executing.delete(p)
    p.then(clean, clean)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

module.exports = {
  sha1,
  splitTokens,
  sanitizePromptText,
  lexicalScore,
  promiseAllStep
}
