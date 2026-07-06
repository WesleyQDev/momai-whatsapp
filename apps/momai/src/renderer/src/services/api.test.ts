import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./ttsService', () => ({
  getTTSServiceRenderer: vi.fn(() => ({
    speak: vi.fn(),
    stop: vi.fn()
  }))
}))

vi.mock('../utils/text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/text')>()),
  cleanMomaiActions: vi.fn((s: string) => s)
}))

vi.mock('../constants', () => ({
  API_URL: 'http://localhost:8000'
}))

import { stripEmojisAndMarkdown } from '../utils/text'
import { safeJsonParse, installExtension } from './api'
import type { InstallProgress, InstallError } from './api'

describe('stripEmojisAndMarkdown', () => {
  it('removes emojis', () => {
    expect(stripEmojisAndMarkdown('Hello 😊 world')).toBe('Hello  world')
  })

  it('removes bold markers', () => {
    expect(stripEmojisAndMarkdown('**bold**')).toBe('bold')
  })

  it('removes inline code', () => {
    expect(stripEmojisAndMarkdown('`code`')).toBe('code')
  })

  it('removes italic markers', () => {
    expect(stripEmojisAndMarkdown('*italic*')).toBe('italic')
  })

  it('removes code blocks', () => {
    expect(stripEmojisAndMarkdown('a ```code block``` b')).toBe('a  b')
  })

  it('removes headers', () => {
    expect(stripEmojisAndMarkdown('## header')).toBe('header')
  })

  it('removes links', () => {
    expect(stripEmojisAndMarkdown('[text](url)')).toBe('text')
  })

  it('normalizes 3+ newlines to 2', () => {
    expect(stripEmojisAndMarkdown('a\n\n\n\nb')).toBe('a\n\nb')
  })

  it('removes regular quotes', () => {
    expect(stripEmojisAndMarkdown('"hello"')).toBe('hello')
  })
})

describe('safeJsonParse', () => {
  it('parses valid JSON strings', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON array', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('returns undefined for invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(safeJsonParse(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(safeJsonParse(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(safeJsonParse('')).toBeUndefined()
  })
})

/**
 * Helpers to build a mock fetch Response whose .body is a ReadableStream
 * emitting the provided NDJSON chunks (one per array item, separated by \n).
 */
function makeNdjsonResponse(chunks: object[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(JSON.stringify(c) + '\n'))
      controller.close()
    }
  })
  return {
    ok: true,
    status: 200,
    body: stream
  } as unknown as Response
}

describe('installExtension', () => {
  beforeEach(() => {
    // window.api is set in test-setup.ts but getSessionToken is not.
    ;(window as any).api = {
      ...((window as any).api),
      getSessionToken: vi.fn(() => 'mock-token')
    }
  })

  it('posts { id } when no version/downloadUrl is provided', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeNdjsonResponse([{ ok: true }]))
    )
    vi.stubGlobal('fetch', fetchMock)

    await installExtension('my-ext')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const request = calls[0][1]
    expect(JSON.parse(request.body as string)).toEqual({ id: 'my-ext' })
    vi.unstubAllGlobals()
  })

  it('posts { id, version } when version is provided', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeNdjsonResponse([{ ok: true }]))
    )
    vi.stubGlobal('fetch', fetchMock)

    await installExtension('my-ext', { version: '0.3.30' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const request = calls[0][1]
    expect(JSON.parse(request.body as string)).toEqual({ id: 'my-ext', version: '0.3.30' })
    vi.unstubAllGlobals()
  })

  it('posts { id, download_url } when downloadUrl is provided (back-compat)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeNdjsonResponse([{ ok: true }]))
    )
    vi.stubGlobal('fetch', fetchMock)

    await installExtension('my-ext', { downloadUrl: 'https://example.com/x.zip' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const request = calls[0][1]
    expect(JSON.parse(request.body as string)).toEqual({
      id: 'my-ext',
      download_url: 'https://example.com/x.zip'
    })
    vi.unstubAllGlobals()
  })

  it('calls onProgress with stage chunks', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeNdjsonResponse([
          { stage: 'downloading', status: 'Baixando', percent: 10, global_percent: 5 },
          { stage: 'extracting', status: 'Extraindo', percent: 50, global_percent: 80 },
          { ok: true }
        ])
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const onProgress = vi.fn()
    await installExtension('my-ext', { onProgress })

    expect(onProgress).toHaveBeenCalledTimes(2)
    const first = onProgress.mock.calls[0][0] as InstallProgress
    expect(first.stage).toBe('downloading')
    expect(first.percent).toBe(10)
    const second = onProgress.mock.calls[1][0] as InstallProgress
    expect(second.stage).toBe('extracting')
    vi.unstubAllGlobals()
  })

  it('calls onError when stream contains an error chunk (and does not throw)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeNdjsonResponse([
          {
            ok: false,
            status: 409,
            error: 'incompatible_version',
            required_range: '>=2.0.0',
            release_version: '0.4.0'
          }
        ])
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const onError = vi.fn()
    await installExtension('my-ext', { onError })

    expect(onError).toHaveBeenCalledTimes(1)
    const err = onError.mock.calls[0][0] as InstallError
    expect(err.ok).toBe(false)
    expect(err.error).toBe('incompatible_version')
    expect(err.required_range).toBe('>=2.0.0')
    expect(err.release_version).toBe('0.4.0')
    vi.unstubAllGlobals()
  })

  it('throws an Error with .error string when no onError is provided', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeNdjsonResponse([
          {
            ok: false,
            status: 404,
            error: 'unknown_extension'
          }
        ])
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(installExtension('unknown')).rejects.toThrow('unknown_extension')
    vi.unstubAllGlobals()
  })

  it('throws "Erro ao iniciar instalação de extensão" when response is not ok', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, body: null } as unknown as Response)
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(installExtension('my-ext')).rejects.toThrow(
      'Erro ao iniciar instalação de extensão'
    )
    vi.unstubAllGlobals()
  })
})
