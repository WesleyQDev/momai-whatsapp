import { describe, expect, it } from 'vitest'
import {
  getChatBubbleClasses,
  getChatBubbleStyle,
  getChatBubbleTimeClasses,
  WHATSAPP_OUTGOING_BUBBLE_COLOR
} from '../src/utils/chatBubble'

describe('WhatsApp outgoing bubble color', () => {
  it('uses the WhatsApp green the extension ships with', () => {
    expect(WHATSAPP_OUTGOING_BUBBLE_COLOR).toBe('#21815D')
  })

  it('paints outgoing bubbles with that green instead of the host accent', () => {
    expect(getChatBubbleStyle(true)).toEqual({
      backgroundColor: '#21815D',
      borderColor: '#21815D'
    })
    expect(getChatBubbleClasses(true)).toContain('text-white')
    expect(getChatBubbleClasses(true)).not.toContain('bg-accent')
  })

  it('keeps incoming bubbles on the host theme surface', () => {
    expect(getChatBubbleStyle(false)).toEqual({})
    expect(getChatBubbleClasses(false)).toContain('bg-input/80')
  })
})

describe('getChatBubbleTimeClasses', () => {
  it('renders the outgoing timestamp over the green bubble', () => {
    expect(getChatBubbleTimeClasses(true)).toContain('text-white')
  })

  it('renders the incoming timestamp with the muted text color', () => {
    expect(getChatBubbleTimeClasses(false)).toBe('text-text-muted')
  })
})
