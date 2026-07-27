import type { MomAISDK } from './runtime'

interface SDKAdapter {
  version: number
  adapt(sdk: MomAISDK): MomAISDK
}

class SDKv1Adapter implements SDKAdapter {
  version = 1
  adapt(sdk: MomAISDK): MomAISDK {
    return sdk
  }
}

const adapters: Record<number, SDKAdapter> = {
  1: new SDKv1Adapter()
}

const availableVersions = Object.keys(adapters).map(Number).sort((a, b) => a - b)
const maxSDKVersion = availableVersions[availableVersions.length - 1]

export function getAdapter(sdkVersion: number): SDKAdapter {
  if (adapters[sdkVersion]) return adapters[sdkVersion]
  for (let i = availableVersions.length - 1; i >= 0; i--) {
    if (availableVersions[i] <= sdkVersion) return adapters[availableVersions[i]]
  }
  throw new Error(`SDK v${sdkVersion} não é suportada nesta versão da MomAI (máxima: v${maxSDKVersion})`)
}

export function adaptSDK(sdk: MomAISDK, sdkVersion: number): MomAISDK {
  const adapter = getAdapter(sdkVersion)
  return adapter.adapt(sdk)
}

export { maxSDKVersion }
