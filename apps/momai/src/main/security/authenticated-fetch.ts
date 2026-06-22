import { getOrCreateSessionToken } from './session-token'

export async function authFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const token = getOrCreateSessionToken()
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
