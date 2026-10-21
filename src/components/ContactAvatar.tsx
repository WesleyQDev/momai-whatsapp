import { useEffect, useState } from 'react'
import ImageViewer from 'momai:image-viewer'

const getAvatarColor = (id: string): string => {
  let hash = 0
  const str = id || 'default'
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

const getInitials = (name: string): string => {
  if (!name) return ''
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean || /^\d+$/.test(clean)) return ''
  const parts = clean.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].slice(0, 1).toUpperCase()
}

export default function ContactAvatar({
  src,
  name,
  id,
  className,
  size = 'md',
  disableViewer = false
}: {
  src?: string | null
  name: string
  id: string
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  disableViewer?: boolean
}) {
  const [error, setError] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  const sizeClasses =
    size === 'xs'
      ? 'w-6 h-6 text-[10px]'
      : size === 'sm'
        ? 'w-8 h-8 text-xs'
        : size === 'lg'
          ? 'w-12 h-12 text-base'
          : 'w-10 h-10 text-sm'

  const finalClass = className || sizeClasses

  if (src && !error) {
    return (
      <>
        <img
          src={src}
          alt={name}
          onError={() => setError(true)}
          className={`${finalClass} rounded-full object-cover shrink-0 ${
            disableViewer ? '' : 'cursor-pointer hover:opacity-80 transition-opacity'
          }`}
          onClick={(e) => {
            if (disableViewer) return
            e.stopPropagation()
            setShowViewer(true)
          }}
        />
        {showViewer && !disableViewer && (
          <ImageViewer src={src} alt={name} onClose={() => setShowViewer(false)} />
        )}
      </>
    )
  }

  const initials = getInitials(name)
  if (initials) {
    const color = getAvatarColor(id)
    return (
      <div
        className={`${finalClass} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    )
  }

  const isPhone = /^[+\d\s().-]*$/.test(name)
  const isGroup = typeof id === 'string' && id.endsWith('@g.us')
  return (
    <div
      className={`${finalClass} rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0`}
    >
      {isGroup ? '👥' : isPhone ? '📱' : '👤'}
    </div>
  )
}
