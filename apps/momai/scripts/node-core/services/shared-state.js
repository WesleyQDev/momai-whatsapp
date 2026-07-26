const store = {}
const llamaState = {}
const semanticState = {}
const modelDownloadState = {}

let skillRegistry = null
let promptRegistry = null
let broadcast = null

let activeThreadId = 'default'

function setActiveThreadId(id) {
  if (typeof id === 'string' && id.trim()) {
    activeThreadId = id.trim()
  }
}

function getActiveThreadId() {
  return activeThreadId || 'default'
}

const observabilityBuffer = []

module.exports = {
  store,
  llamaState,
  semanticState,
  modelDownloadState,
  skillRegistry,
  promptRegistry,
  broadcast,
  observabilityBuffer,
  setActiveThreadId,
  getActiveThreadId
}
