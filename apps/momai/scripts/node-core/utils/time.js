function isoNow() {
  return new Date().toISOString()
}

function parseTime(value) {
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : Date.now()
}

module.exports = {
  isoNow,
  parseTime
}
