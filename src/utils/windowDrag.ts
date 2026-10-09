import { useCallback, useEffect, useRef } from 'react'
import sdk from 'momai:sdk'

/**
 * Window drag for overlay panels.
 *
 * `sdk.ui.dragWindow` is the host implementation (pointer capture, one move
 * per animation frame, click suppression after a drag). Hosts older than the
 * method fall back to the local copy below, which keeps the same guarantees.
 */
export interface WindowDragOptions {
  /** Pointer travel in px before a press becomes a window drag. Default 4. */
  threshold?: number
  /** CSS selector for elements that must keep their own pointer behavior. */
  ignoreSelector?: string
  /** Notified when the press turns into a drag and when it ends. */
  onDragStateChange?: (dragging: boolean) => void
}

type DragCleanup = () => void
type HostDragWindow = (element: HTMLElement, options?: WindowDragOptions) => DragCleanup

const DEFAULT_DRAG_THRESHOLD_PX = 4
const DEFAULT_DRAG_IGNORE_SELECTOR =
  'button, a, input, textarea, select, label, [contenteditable=""], [contenteditable="true"], [data-no-window-drag]'

type OverlayMoveFn = (data: { x: number; y: number }) => void

function resolveMoveOverlay(win: Window): OverlayMoveFn | null {
  const host = win as unknown as {
    momaiAPI?: { moveOverlay?: OverlayMoveFn }
    api?: { moveOverlay?: OverlayMoveFn }
  }
  const move = host.momaiAPI?.moveOverlay ?? host.api?.moveOverlay
  return typeof move === 'function' ? move : null
}

export function dragWindow(element: HTMLElement, options: WindowDragOptions = {}): DragCleanup {
  const hostDrag = (sdk.ui as { dragWindow?: HostDragWindow } | undefined)?.dragWindow
  if (typeof hostDrag === 'function') return hostDrag(element, options)
  return localDragWindow(element, options)
}

function localDragWindow(element: HTMLElement, options: WindowDragOptions): DragCleanup {
  const win = element?.ownerDocument?.defaultView
  if (!element || typeof element.addEventListener !== 'function' || !win) return () => {}

  const threshold =
    typeof options.threshold === 'number' && Number.isFinite(options.threshold)
      ? Math.max(0, options.threshold)
      : DEFAULT_DRAG_THRESHOLD_PX
  const ignoreSelector = options.ignoreSelector ?? DEFAULT_DRAG_IGNORE_SELECTOR
  const onDragStateChange = options.onDragStateChange

  const requestFrame =
    typeof win.requestAnimationFrame === 'function'
      ? (callback: () => void) => win.requestAnimationFrame(callback)
      : (callback: () => void) => win.setTimeout(callback, 16) as unknown as number
  const cancelFrame =
    typeof win.cancelAnimationFrame === 'function'
      ? (id: number) => win.cancelAnimationFrame(id)
      : (id: number) => win.clearTimeout(id)

  let pointerId: number | null = null
  let startScreenX = 0
  let startScreenY = 0
  let startWinX = 0
  let startWinY = 0
  let dragging = false
  let frameId = 0
  let pending: { x: number; y: number } | null = null
  let sentX = Number.NaN
  let sentY = Number.NaN

  const flushMove = () => {
    frameId = 0
    const next = pending
    pending = null
    if (!next) return
    if (next.x === sentX && next.y === sentY) return
    const move = resolveMoveOverlay(win)
    if (!move) return
    sentX = next.x
    sentY = next.y
    try {
      move(next)
    } catch {
      // A dead window must not break the drag gesture.
    }
  }

  const scheduleMove = (x: number, y: number) => {
    pending = { x, y }
    if (frameId) return
    frameId = requestFrame(flushMove)
  }

  const suppressNextClick = () => {
    const suppressor = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    win.addEventListener('click', suppressor, true)
    win.setTimeout(() => win.removeEventListener('click', suppressor, true), 0)
  }

  const release = () => {
    win.removeEventListener('pointermove', handlePointerMove, true)
    win.removeEventListener('pointerup', handlePointerUp, true)
    win.removeEventListener('pointercancel', handlePointerUp, true)
    win.removeEventListener('blur', handleWindowBlur, true)
    if (pointerId !== null) {
      try {
        element.releasePointerCapture?.(pointerId)
      } catch {
        // Capture may already be gone.
      }
    }
    pointerId = null
    if (frameId) {
      cancelFrame(frameId)
      frameId = 0
    }
    pending = null
    if (dragging) {
      dragging = false
      onDragStateChange?.(false)
    }
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerId === null || event.pointerId !== pointerId) return
    if (event.buttons === 0) {
      // The pointerup was missed (e.g. released over another window).
      release()
      return
    }
    const dx = event.screenX - startScreenX
    const dy = event.screenY - startScreenY
    if (!dragging) {
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
      dragging = true
      onDragStateChange?.(true)
    }
    scheduleMove(Math.round(startWinX + dx), Math.round(startWinY + dy))
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (pointerId === null || event.pointerId !== pointerId) return
    const wasDragging = dragging
    release()
    if (wasDragging) suppressNextClick()
  }

  const handleWindowBlur = () => release()

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || pointerId !== null) return
    const target = event.target as Element | null
    if (ignoreSelector && target?.closest?.(ignoreSelector)) return

    pointerId = event.pointerId
    dragging = false
    startScreenX = event.screenX
    startScreenY = event.screenY
    startWinX = win.screenX
    startWinY = win.screenY
    try {
      element.setPointerCapture?.(event.pointerId)
    } catch {
      // Pointer capture is best-effort; window listeners still cover it.
    }
    win.addEventListener('pointermove', handlePointerMove, true)
    win.addEventListener('pointerup', handlePointerUp, true)
    win.addEventListener('pointercancel', handlePointerUp, true)
    win.addEventListener('blur', handleWindowBlur, true)
  }

  element.addEventListener('pointerdown', handlePointerDown)
  return () => {
    element.removeEventListener('pointerdown', handlePointerDown)
    release()
  }
}

/**
 * Callback ref that turns an element into a window drag handle. Works with
 * conditionally rendered headers: React calls the ref again when the element
 * mounts or unmounts.
 */
export function useWindowDrag<T extends HTMLElement>(
  options: WindowDragOptions = {}
): (element: T | null) => void {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const cleanupRef = useRef<DragCleanup | null>(null)

  const attach = useCallback((element: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (element) {
      cleanupRef.current = dragWindow(element, optionsRef.current)
    }
  }, [])

  useEffect(
    () => () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    },
    []
  )

  return attach
}
