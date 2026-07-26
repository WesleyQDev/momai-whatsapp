// TDD: verifies that chat history lives ONLY in node-core-store.json
// and that the redundant messages.json backup is never written.
//
// See Task 2.1 of the privacy plan:
//   docs/superpowers/plans/2026-06-23-momai-privacy-data-cleanup.md (R001)

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

describe('store: messages persist in node-core-store.json (no separate messages.json)', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-store-'))
    process.env.MOMAI_NODE_CORE_DATA_DIR = tmpDir
    vi.resetModules()
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('saveStoreNow writes node-core-store.json with thread_messages and does NOT create messages.json', () => {
    const { appendMessage, saveStoreNow, store } = require('./store')

    appendMessage(store, 'thread-1', 'user', 'hello')
    saveStoreNow(store)

    const storePath = path.join(tmpDir, 'node-core-store.json')
    const messagesPath = path.join(tmpDir, 'messages.json')

    expect(fs.existsSync(storePath)).toBe(true)
    expect(fs.existsSync(messagesPath)).toBe(false)

    const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'))
    expect(persisted.thread_messages['thread-1']).toHaveLength(1)
    expect(persisted.thread_messages['thread-1'][0].role).toBe('user')
    expect(persisted.thread_messages['thread-1'][0].content).toBe('hello')
  })

  it('persists structured_responses when provided in extras', () => {
    const { appendMessage, saveStoreNow, store } = require('./store')
    const widgetData = [{ type: 'weather', data: { location: 'Curitiba', temp: '20°C' } }]

    appendMessage('thread-widget-test', 'assistant', 'Aqui esta a previsao', {
      structured_responses: widgetData
    })
    saveStoreNow(store)

    const dataDir = process.env.MOMAI_NODE_CORE_DATA_DIR || tmpDir
    const storePath = path.join(dataDir, 'node-core-store.json')
    expect(fs.existsSync(storePath)).toBe(true)
    const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'))
    const savedMsg = persisted.thread_messages['thread-widget-test'][0]

    expect(savedMsg.structured_response).toBe(JSON.stringify(widgetData))
  })
})
