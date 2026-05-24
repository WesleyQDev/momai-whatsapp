import React from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ImageViewerProps {
  src: string
  alt?: string
  onClose: () => void
}

export default function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  // Use a portal to ensure the image viewer is on top of everything but below titlebar (z-index < 999)
  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      style={{ top: '32px' }} // Adjusted to always show titlebar (assuming titlebar is 32px height)
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-[600]"
        aria-label="Close"
      >
        <XMarkIcon className="w-8 h-8" />
      </button>

      <div
        className="relative max-w-[40vw] max-h-[40vh] flex items-center justify-center animate-in zoom-in duration-300 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt || 'Image Preview'}
          className="max-w-full max-h-full object-contain shadow-2xl pointer-events-auto border-2 border-white/10"
        />
      </div>

      <div className="absolute inset-0 -z-10" />
    </div>,
    document.body
  )
}
