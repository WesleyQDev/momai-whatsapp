function percentile(arr, p) {
  if (!arr || arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const k = (sorted.length - 1) * (p / 100)
  const f = Math.floor(k)
  const c = Math.ceil(k)
  if (f === c) return sorted[f]
  return sorted[f] * (c - k) + sorted[c] * (k - f)
}

module.exports = { percentile }
