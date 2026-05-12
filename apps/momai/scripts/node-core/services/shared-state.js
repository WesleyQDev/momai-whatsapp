const store = {}
const llamaState = {}
const semanticState = {}
const modelDownloadState = {}

let skillRegistry = null
let promptRegistry = null
let broadcast = null

const observabilityBuffer = []

module.exports = {
  store,
  llamaState,
  semanticState,
  modelDownloadState,
  skillRegistry,
  promptRegistry,
  broadcast,
  observabilityBuffer
}
