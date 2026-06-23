import type { TTSEngine } from './ttsService'

export type NodeCoreReadyMessage = {
  type: 'node-core-ready'
  brainReady?: boolean
  isLoading?: boolean
}

export type NodeCoreLogMessage = {
  type: 'node-core-log'
  message?: string
}

export type NodeCoreErrorMessage = {
  type: 'node-core-error'
  error?: string
}

export type EnsurePythonRequestMessage = {
  type: 'ensure-python'
  requestId: string
}

export type TtsSpeakMessage = {
  type: 'tts-speak'
  requestId?: string
  text?: string
  voice?: string
  engine?: TTSEngine
}

export type KeychainEncryptMessage = {
  type: 'keychain:encrypt'
  requestId?: string
}

export type KeychainDecryptMessage = {
  type: 'keychain:decrypt'
  requestId?: string
}

export type SecureStorageEncryptMessage = {
  type: 'secure-storage:encrypt'
  requestId?: string
  payload?: { plain?: string }
}

export type SecureStorageDecryptMessage = {
  type: 'secure-storage:decrypt'
  requestId?: string
  payload?: { encryptedBase64?: string }
}

export type NodeCoreMessage =
  | NodeCoreReadyMessage
  | NodeCoreLogMessage
  | NodeCoreErrorMessage
  | EnsurePythonRequestMessage
  | TtsSpeakMessage
  | KeychainEncryptMessage
  | KeychainDecryptMessage
  | SecureStorageEncryptMessage
  | SecureStorageDecryptMessage

export function isNodeCoreMessage(value: unknown): value is NodeCoreMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  if (typeof candidate.type !== 'string') return false
  switch (candidate.type) {
    case 'node-core-ready':
    case 'node-core-log':
    case 'node-core-error':
    case 'ensure-python':
    case 'tts-speak':
    case 'keychain:encrypt':
    case 'keychain:decrypt':
    case 'secure-storage:encrypt':
    case 'secure-storage:decrypt':
      return true
    default:
      return false
  }
}
