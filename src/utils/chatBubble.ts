// WhatsApp's own bubble green. The host accent changes with the app theme, so
// outgoing bubbles must not depend on `bg-accent`.
export const WHATSAPP_OUTGOING_BUBBLE_COLOR = '#21815D'

const OUTGOING_BUBBLE = 'rounded-tr-xs text-white'
const INCOMING_BUBBLE = 'bg-input/80 border-border/50 text-text rounded-tl-xs'

export function getChatBubbleClasses(isOutgoing: boolean): string {
  return isOutgoing ? OUTGOING_BUBBLE : INCOMING_BUBBLE
}

/**
 * Inline style for the outgoing color: the host only generates Tailwind
 * utilities present in the app source, so `bg-[#144D37]` from an extension
 * bundle would never be created.
 */
export function getChatBubbleStyle(isOutgoing: boolean): Record<string, string> {
  return isOutgoing
    ? {
        backgroundColor: WHATSAPP_OUTGOING_BUBBLE_COLOR,
        borderColor: WHATSAPP_OUTGOING_BUBBLE_COLOR
      }
    : {}
}

export function getChatBubbleTimeClasses(isOutgoing: boolean): string {
  return isOutgoing ? 'text-white opacity-70' : 'text-text-muted'
}
