export type Variant = 'dev' | 'nsis' | 'appx-store' | 'appx-test'

export interface VariantConfig {
  variant: Variant
  appId: string
  appName: string
  userDataSubdir: string
  corePort: number
  pythonPort: number
  llamaPort: number
  embeddingPort: number
  displayLabel: string
}

const TABLE: Record<Variant, VariantConfig> = {
  dev: {
    variant: 'dev',
    appId: 'com.wesleyqdev.momai.dev',
    appName: 'MomAI (Dev)',
    userDataSubdir: 'MomAI-Dev',
    corePort: 8050,
    pythonPort: 8051,
    llamaPort: 8052,
    embeddingPort: 8053,
    displayLabel: 'Dev'
  },
  nsis: {
    variant: 'nsis',
    appId: 'com.wesleyqdev.momai.nsis',
    appName: 'MomAI',
    userDataSubdir: 'MomAI',
    corePort: 8100,
    pythonPort: 8101,
    llamaPort: 8102,
    embeddingPort: 8103,
    displayLabel: 'NSIS'
  },
  'appx-store': {
    variant: 'appx-store',
    appId: 'com.wesleyqdev.momai',
    appName: 'MomAI - Assistente',
    userDataSubdir: 'MomAI-Store',
    corePort: 8200,
    pythonPort: 8201,
    llamaPort: 8202,
    embeddingPort: 8203,
    displayLabel: 'Loja'
  },
  'appx-test': {
    variant: 'appx-test',
    appId: 'com.wesleyqdev.momai.test',
    appName: 'MomAI - Teste',
    userDataSubdir: 'MomAI-Teste',
    corePort: 8300,
    pythonPort: 8301,
    llamaPort: 8302,
    embeddingPort: 8303,
    displayLabel: 'Teste'
  }
}

export const VARIANTS: Record<Variant, VariantConfig> = TABLE

export function isValidVariant(s: string): s is Variant {
  return s === 'dev' || s === 'nsis' || s === 'appx-store' || s === 'appx-test'
}

function resolveVariant(): VariantConfig {
  const env = process.env.MOMAI_VARIANT
  if (env && isValidVariant(env)) {
    return TABLE[env]
  }
  return TABLE.dev
}

export const CURRENT_VARIANT: VariantConfig = resolveVariant()
