// Shared state for the node-core application
// This module centralizes all mutable state that needs to be shared across modules

const sharedState = {
  // LLama state
  llamaState: {
    process: null,
    ready: false,
    starting: false,
    startingPromise: null,
    lastError: null,
    backend: null,
    backendReason: null,
    backendMode: 'auto',
    modelPath: null,
    configuredModelFile: null,
    usingFallbackModel: false,
    contextTotalTokens: 8192,
    currentTier: null,
    currentModelName: null,
    port: 8080
  },
  llamaStartGeneration: 0,

  // Semantic state
  semanticState: {
    enabled: false,
    ready: false,
    degraded: false,
    lastFallbackReason: null,
    fallbackCount: 0,
    queryCount: 0,
    lastNotesSyncAt: 0,
    lastSkillSyncAt: 0,
    notesSnapshotHash: null,
    skillsSnapshotHash: null,
    toolsSnapshotHash: null,
    lanceModule: null,
    syncingNotes: false,
    syncingSkills: false,
    db: null,
    tableNotes: null,
    tableSkills: null,
    tableTools: null,
    embedding: {
      process: null,
      starting: false,
      startingPromise: null,
      ready: false,
      backend: null,
      modelPath: null,
      lastError: null,
      cache: new Map()
    },
    latency: {
      embeddingMs: [],
      retrievalMs: [],
      toolExecMs: []
    }
  },
  embeddingStartGeneration: 0,

  // Model download state
  modelDownloadState: {
    in_progress: false,
    tier: null,
    file: null,
    downloaded_bytes: 0,
    total_bytes: null,
    progress: 0,
    status: 'idle',
    message: null,
    error: null,
    updated_at: new Date().toISOString()
  },
  modelDownloadPromises: new Map(),

  // TTS/Voice state
  stopGenerationRequested: false,
  stopVoiceRequested: false,
  activeChatControllers: new Set(),

  // WebSocket state
  wss: null,
  wsClients: new Set(),
  pythonWs: null,

  // Python sidecar
  ensurePythonPending: new Map(),
  ensurePythonMsgId: 0,

  // Skill registry and prompt registry (set by index.js)
  skillRegistry: null,
  promptRegistry: null,

  // Store (set by index.js)
  store: null
}

module.exports = sharedState
