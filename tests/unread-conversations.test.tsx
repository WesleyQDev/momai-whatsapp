// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnreadConversations } from '../src/hooks/useUnreadConversations'

let container: HTMLDivElement
let root: Root

type HookApi = ReturnType<typeof useUnreadConversations>
let api: HookApi | null = null

function Harness({ seed }: { seed: string[] }) {
  const hook = useUnreadConversations()
  useEffect(() => {
    api = hook
  }, [hook])
  useEffect(() => {
    seed.forEach((jid) => hook.markUnread(jid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

async function mount(seed: string[] = []) {
  api = null
  await act(async () => {
    root.render(<Harness seed={seed} />)
  })
  if (!api) throw new Error('hook did not mount')
  return api
}

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  api = null
})

describe('useUnreadConversations clears the same chat across JID variants', () => {
  it('clears a device-suffixed variant when the canonical JID is marked read', async () => {
    const hook = await mount(['5511999999999:12@s.whatsapp.net'])
    expect(hook.unreadJids).toContain('5511999999999:12@s.whatsapp.net')

    await act(async () => {
      api?.markRead('5511999999999@s.whatsapp.net')
    })

    expect(api?.unreadJids ?? []).toHaveLength(0)
  })

  it('treats the canonical JID as read when checking variants', async () => {
    const hook = await mount(['5511999999999@s.whatsapp.net'])

    let current: HookApi | null = null
    await act(async () => {
      current = api
    })

    expect(current?.isUnread('5511999999999:7@s.whatsapp.net')).toBe(true)
  })

  it('keeps read transitions silent in the log', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    try {
      await mount([])
      await act(async () => {
        api?.markUnread('5511999999999@s.whatsapp.net')
      })
      await act(async () => {
        api?.markRead('5511999999999@s.whatsapp.net')
      })
      expect(debugSpy).not.toHaveBeenCalled()
    } finally {
      debugSpy.mockRestore()
    }
  })
})
