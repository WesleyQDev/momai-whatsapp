import { vi } from 'vitest'

const exposed: Record<string, unknown> = {}

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      exposed[key] = value
    }
  },
  ipcRenderer: {
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(() => () => {}),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
  }
}))

if (!('contextIsolated' in process)) {
  Object.defineProperty(process, 'contextIsolated', {
    value: true,
    configurable: true,
    writable: true
  })
}

export function getExposed(): Record<string, unknown> {
  return exposed
}

export function resetExposed(): void {
  for (const key of Object.keys(exposed)) {
    delete exposed[key]
  }
}
