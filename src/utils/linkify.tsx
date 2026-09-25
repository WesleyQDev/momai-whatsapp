import React, { type ReactNode } from 'react'

const URL_PATTERN = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/i

/**
 * Splits plain text and renders detected URLs as clickable links.
 * Outgoing bubbles use white underline link styling; incoming bubbles use theme accent.
 * Clicks prevent bubbling and open in the default system browser via Electron setWindowOpenHandler.
 */
export function renderTextWithLinks(text?: string | null, isOutgoing = false): ReactNode {
  if (!text) return null
  const parts = text.split(/(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/g)
  if (parts.length <= 1) return text

  return parts.map((part, index) => {
    if (URL_PATTERN.test(part)) {
      const href =
        part.startsWith('http://') || part.startsWith('https://')
          ? part
          : `https://${part}`

      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation()
            try {
              if (typeof window !== 'undefined' && (window as any).open) {
                (window as any).open(href, '_blank')
              }
            } catch {}
          }}
          className={`underline hover:opacity-80 transition-opacity cursor-pointer font-medium select-text break-all ${
            isOutgoing ? 'text-white underline' : 'text-accent underline'
          }`}
          title={href}
        >
          {part}
        </a>
      )
    }
    return part
  })
}
