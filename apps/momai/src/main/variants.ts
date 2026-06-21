export type Variant = 'dev' | 'nsis' | 'appx-store' | 'appx-test'

export interface VariantConfig {
  variant: Variant
  appId: string
  appName: string
  userDataSubdir: string
  corePort: number
  pythonPort: number
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
    displayLabel: 'Dev'
  },
  nsis: {
    variant: 'nsis',
    appId: 'com.wesleyqdev.momai.nsis',
    appName: 'MomAI',
    userDataSubdir: 'MomAI',
    corePort: 8100,
    pythonPort: 8101,
    displayLabel: 'NSIS'
  },
  'appx-store': {
    variant: 'appx-store',
    appId: 'com.wesleyqdev.momai',
    appName: 'MomAI - Assistente',
    userDataSubdir: 'MomAI-Store',
    corePort: 8200,
    pythonPort: 8201,
    displayLabel: 'Loja'
  },
  'appx-test': {
    variant: 'appx-test',
    appId: 'com.wesleyqdev.momai.test',
    appName: 'MomAI - Teste',
    userDataSubdir: 'MomAI-Teste',
    corePort: 8300,
    pythonPort: 8301,
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
