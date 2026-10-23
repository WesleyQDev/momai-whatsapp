import { describe, expect, it } from 'vitest'
import {
  getChatBubbleClasses,
  getChatBubbleStyle,
  getChatBubbleTimeClasses,
  isLightAppTheme,
  resolveOutgoingBubbleColor,
  WHATSAPP_OUTGOING_BUBBLE_COLOR,
  WHATSAPP_OUTGOING_BUBBLE_COLOR_DARK,
  WHATSAPP_OUTGOING_BUBBLE_COLOR_LIGHT
} from '../src/utils/chatBubble'

describe('WhatsApp outgoing bubble color', () => {
  it('ships the WhatsApp light and dark greens', () => {
    expect(WHATSAPP_OUTGOING_BUBBLE_COLOR_LIGHT).toBe('#D9FDD3')
    expect(WHATSAPP_OUTGOING_BUBBLE_COLOR_DARK).toBe('#144D37')
    expect(WHATSAPP_OUTGOING_BUBBLE_COLOR).toBe('#144D37')
  })

  it('resolves the light green for light themes only', () => {
    expect(resolveOutgoingBubbleColor('light')).toBe('#D9FDD3')
    expect(resolveOutgoingBubbleColor('selenized-light')).toBe('#D9FDD3')
    expect(resolveOutgoingBubbleColor('dark')).toBe('#144D37')
    expect(resolveOutgoingBubbleColor('mono')).toBe('#144D37')
    expect(isLightAppTheme('light')).toBe(true)
    expect(isLightAppTheme('mono')).toBe(false)
  })

  it('paints outgoing bubbles with the theme green instead of the host accent', () => {
    expect(getChatBubbleStyle(true, 'light')).toEqual({
      backgroundColor: '#D9FDD3',
      borderColor: '#D9FDD3'
    })
    expect(getChatBubbleStyle(true, 'mono')).toEqual({
      backgroundColor: '#144D37',
      borderColor: '#144D37'
    })
    expect(getChatBubbleClasses(true)).toContain('text-text')
    expect(getChatBubbleClasses(true)).not.toContain('text-white')
    expect(getChatBubbleClasses(true)).not.toContain('bg-accent')
  })

  it('keeps incoming bubbles on the host theme surface', () => {
    expect(getChatBubbleStyle(false)).toEqual({})
    expect(getChatBubbleClasses(false)).toContain('bg-input/80')
  })
})

describe('getChatBubbleTimeClasses', () => {
  it('renders the outgoing timestamp with the muted theme color', () => {
    expect(getChatBubbleTimeClasses(true)).toContain('text-text-muted')
    expect(getChatBubbleTimeClasses(true)).not.toContain('text-white')
  })

  it('renders the incoming timestamp with the muted text color', () => {
    expect(getChatBubbleTimeClasses(false)).toBe('text-text-muted')
  })
})
