import { describe, it, expect } from 'vitest'
import { shouldBlockWebviewAttachment } from './webview-block'

describe('shouldBlockWebviewAttachment', () => {
  it('returns true to block all webview attachments', () => {
    expect(shouldBlockWebviewAttachment()).toBe(true)
  })
})
