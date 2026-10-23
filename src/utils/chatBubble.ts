// Outgoing bubble greens follow the WhatsApp palette per app theme: light
// themes use the light green, dark/monochrome themes use the dark green. The
// host accent changes with the app theme, so outgoing bubbles must not depend
// on `bg-accent`.
export const WHATSAPP_OUTGOING_BUBBLE_COLOR_LIGHT = '#D9FDD3'
export const WHATSAPP_OUTGOING_BUBBLE_COLOR_DARK = '#144D37'
/** Default outgoing color (dark/monochrome themes). Kept for compatibility. */
export const WHATSAPP_OUTGOING_BUBBLE_COLOR = WHATSAPP_OUTGOING_BUBBLE_COLOR_DARK

const OUTGOING_BUBBLE = 'rounded-tr-xs text-text'
const INCOMING_BUBBLE = 'bg-input/80 border-border/50 text-text rounded-tl-xs'

/**
 * Reads the host theme from the document root. Extension UI renders inside
 * the host renderer, so `data-theme` is the source of truth. Falls back to
 * dark when the DOM is unavailable (tests, worker).
 */
export function getAppTheme(): string {
  try {
    if (typeof document !== 'undefined' && document?.documentElement) {
      return document.documentElement.getAttribute('data-theme') || 'dark'
    }
  } catch {
    // ignore and fall through to the dark default
  }
  return 'dark'
}

/** True for the light host themes, where the outgoing bubble is light green. */
export function isLightAppTheme(theme?: string): boolean {
  const current = (theme ?? getAppTheme()).toLowerCase()
  return current === 'light' || current === 'selenized-light'
}

/** Resolves the outgoing bubble green for the given (or current) app theme. */
export function resolveOutgoingBubbleColor(theme?: string): string {
  return isLightAppTheme(theme)
    ? WHATSAPP_OUTGOING_BUBBLE_COLOR_LIGHT
    : WHATSAPP_OUTGOING_BUBBLE_COLOR_DARK
}

export function getChatBubbleClasses(isOutgoing: boolean, theme?: string): string {
  if (!isOutgoing) return INCOMING_BUBBLE
  void theme
  return OUTGOING_BUBBLE
}

/**
 * Inline style for the outgoing color: the host only generates Tailwind
 * utilities present in the app source, so `bg-[#144D37]` from an extension
 * bundle would never be created.
 */
export function getChatBubbleStyle(
  isOutgoing: boolean,
  theme?: string
): Record<string, string> {
  if (!isOutgoing) return {}
  const backgroundColor = resolveOutgoingBubbleColor(theme)
  return { backgroundColor, borderColor: backgroundColor }
}

export function getChatBubbleTimeClasses(isOutgoing: boolean, theme?: string): string {
  if (!isOutgoing) return 'text-text-muted'
  void theme
  return 'text-text-muted opacity-70'
}
