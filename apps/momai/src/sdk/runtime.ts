import type { MomAISDK } from './types'
import { createApi } from './modules/api'
import { createStorage } from './modules/storage'
import { createEvents } from './modules/events'
import { createLlm } from './modules/llm'
import { createRegistry } from './modules/registry'
import { createHas } from './modules/has'
import { createConfig } from './modules/config'
import { createOAuth } from './modules/oauth'
import { createNotifications } from './modules/notifications'
import { adaptSDK, maxSDKVersion } from './adapter'

export type { MomAISDK } from './types'

let _sdk: MomAISDK | null = null

export function getSDK(version: number = maxSDKVersion): MomAISDK {
  if (!_sdk) {
    _sdk = {
      api: createApi(),
      storage: createStorage(),
      events: createEvents(),
      llm: createLlm(),
      registry: createRegistry(),
      notifications: createNotifications(),
      theme: {
        setColors: async () => {},
        setFont: async () => {},
        getCurrentTheme: async () => ({ colors: {}, fonts: {} })
      },
      scheduler: { cron: () => ({ cancel: () => {} }) },
      oauth: createOAuth(),
      config: createConfig(),
      process: {
        spawn: async () => ({ stdout: '', stderr: '', exitCode: 0 })
      },
      system: {
        mouse: { click: async () => {}, move: async () => {} },
        keyboard: { type: async () => {}, press: async () => {} },
        screen: { capture: async () => Buffer.from('') }
      },
      browser: {
        open: async () => {},
        evaluate: async () => null,
        screenshot: async () => Buffer.from('')
      },
      has: createHas().has,
      dev: {
        reload: () => {},
        log: (...args: any[]) => console.log('[MomAI:Extension]', ...args)
      }
    }
    _sdk = adaptSDK(_sdk, maxSDKVersion)
  }
  if (version !== maxSDKVersion) {
    return adaptSDK(_sdk, version)
  }
  return _sdk
}

export default getSDK()
