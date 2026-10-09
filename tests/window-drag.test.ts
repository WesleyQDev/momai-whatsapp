import { describe, it, expect, vi } from 'vitest'
import { dragWindow } from '../src/utils/windowDrag'

type FakeListener = (event: any) => void

function makeEvent(fields: Record<string, any> = {}) {
  const event: any = {
    preventDefault: () => {
      event.__prevented = true
    },
    stopImmediatePropagation: () => {
      event.__stopped = true
    },
    ...fields
  }
  return event
}

function createFakeHarness() {
  const winListeners = new Map<string, { capture: Set<FakeListener>; bubble: Set<FakeListener> }>()
  const elementListeners = new Map<
    string,
    { capture: Set<FakeListener>; bubble: Set<FakeListener> }
  >()
  const frames = new Map<number, () => void>()
  const timeouts = new Map<number, () => void>()
  let seq = 0

  type ListenerMap = Map<string, { capture: Set<FakeListener>; bubble: Set<FakeListener> }>

  const add = (map: ListenerMap, type: string, cb: FakeListener, capture = false) => {
    if (!map.has(type)) map.set(type, { capture: new Set(), bubble: new Set() })
    ;(capture ? map.get(type)!.capture : map.get(type)!.bubble).add(cb)
  }
  const remove = (map: ListenerMap, type: string, cb: FakeListener, capture = false) => {
    const entry = map.get(type)
    if (!entry) return
    ;(capture ? entry.capture : entry.bubble).delete(cb)
  }
  const dispatch = (map: ListenerMap, type: string, event: any) => {
    const entry = map.get(type)
    if (!entry) return
    for (const phase of [entry.capture, entry.bubble]) {
      for (const cb of [...phase]) {
        cb(event)
        if (event.__stopped) return
      }
    }
  }

  const win: any = {
    screenX: 100,
    screenY: 200,
    momaiAPI: { moveOverlay: vi.fn() },
    requestAnimationFrame: (cb: () => void) => {
      const id = ++seq
      frames.set(id, cb)
      return id
    },
    cancelAnimationFrame: (id: number) => {
      frames.delete(id)
    },
    setTimeout: (cb: () => void) => {
      const id = ++seq
      timeouts.set(id, cb)
      return id
    },
    clearTimeout: (id: number) => {
      timeouts.delete(id)
    },
    addEventListener: (type: string, cb: FakeListener, capture = false) =>
      add(winListeners, type, cb, capture),
    removeEventListener: (type: string, cb: FakeListener, capture = false) =>
      remove(winListeners, type, cb, capture)
  }

  const element: any = {
    ownerDocument: { defaultView: win },
    addEventListener: (type: string, cb: FakeListener, capture = false) =>
      add(elementListeners, type, cb, capture),
    removeEventListener: (type: string, cb: FakeListener, capture = false) =>
      remove(elementListeners, type, cb, capture),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn()
  }

  return {
    win,
    element,
    down(overrides: Record<string, any> = {}) {
      dispatch(
        elementListeners,
        'pointerdown',
        makeEvent({
          button: 0,
          pointerId: 1,
          screenX: 0,
          screenY: 0,
          target: { closest: () => null },
          ...overrides
        })
      )
    },
    move(screenX: number, screenY: number, buttons = 1) {
      dispatch(winListeners, 'pointermove', makeEvent({ pointerId: 1, screenX, screenY, buttons }))
    },
    up() {
      dispatch(winListeners, 'pointerup', makeEvent({ pointerId: 1 }))
    },
    flushFrames() {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((cb) => cb())
    },
    flushTimeouts() {
      const pending = [...timeouts.values()]
      timeouts.clear()
      pending.forEach((cb) => cb())
    },
    dispatchWin(type: string, event: any) {
      dispatch(winListeners, type, event)
    }
  }
}

describe('windowDrag fallback (older hosts without sdk.ui.dragWindow)', () => {
  it('drags the window and coalesces moves per frame', () => {
    const harness = createFakeHarness()
    dragWindow(harness.element, { threshold: 2 })

    harness.down()
    harness.move(10, 6)
    harness.move(30, 40)
    expect(harness.win.momaiAPI.moveOverlay).not.toHaveBeenCalled()

    harness.flushFrames()
    expect(harness.win.momaiAPI.moveOverlay).toHaveBeenCalledTimes(1)
    expect(harness.win.momaiAPI.moveOverlay).toHaveBeenCalledWith({ x: 130, y: 240 })
  })

  it('keeps clicks working while the pointer does not travel', () => {
    const harness = createFakeHarness()
    dragWindow(harness.element, { threshold: 4 })

    const onClick = vi.fn()
    harness.win.addEventListener('click', onClick)
    harness.down()
    harness.up()
    harness.flushFrames()

    expect(harness.win.momaiAPI.moveOverlay).not.toHaveBeenCalled()
    harness.dispatchWin('click', makeEvent())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('suppresses the click that follows a real drag', () => {
    const harness = createFakeHarness()
    dragWindow(harness.element, { threshold: 2 })
    const onClick = vi.fn()
    harness.win.addEventListener('click', onClick)

    harness.down()
    harness.move(20, 0)
    harness.up()

    harness.dispatchWin('click', makeEvent())
    expect(onClick).not.toHaveBeenCalled()

    harness.flushTimeouts()
    harness.dispatchWin('click', makeEvent())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ignores presses on interactive elements', () => {
    const harness = createFakeHarness()
    dragWindow(harness.element, { threshold: 2 })

    harness.down({ target: { closest: () => ({ tagName: 'BUTTON' }) } })
    harness.move(40, 40)
    harness.flushFrames()

    expect(harness.win.momaiAPI.moveOverlay).not.toHaveBeenCalled()
  })

  it('stops moving after cleanup', () => {
    const harness = createFakeHarness()
    const destroy = dragWindow(harness.element, { threshold: 2 })

    destroy()
    harness.down()
    harness.move(30, 30)
    harness.flushFrames()

    expect(harness.win.momaiAPI.moveOverlay).not.toHaveBeenCalled()
  })

  it('reports drag state changes', () => {
    const harness = createFakeHarness()
    const onDragStateChange = vi.fn()
    dragWindow(harness.element, { threshold: 2, onDragStateChange })

    harness.down()
    harness.move(10, 0)
    harness.up()

    expect(onDragStateChange).toHaveBeenNthCalledWith(1, true)
    expect(onDragStateChange).toHaveBeenNthCalledWith(2, false)
  })
})
