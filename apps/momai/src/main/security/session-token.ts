import { randomBytes } from 'node:crypto'

let cachedToken: string | null = null

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function getOrCreateSessionToken(): string {
  if (cachedToken === null) {
    cachedToken = generateSessionToken()
  }
  return cachedToken
}

export function resetSessionTokenForTesting(): void {
  cachedToken = null
}
