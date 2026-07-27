import sdk from 'momai:sdk'

export const api = {
  get: (path: string) => sdk.api.get(path),
  post: (path: string, body?: any) => sdk.api.post(path, body),
  patch: (path: string, body?: any) => sdk.api.post(path, body),
  delete: (path: string) => sdk.api.delete(path)
}
