import { vi } from 'vitest'

if (typeof window === 'undefined') {
  ;(globalThis as any).window = {
    api: {
      getApiBaseUrl: () => 'http://127.0.0.1:8000',
      platform: 'win32',
    },
    electronAPI: {
      platform: 'win32',
    },
  }
}
