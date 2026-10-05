import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuOption {
  id?: string
  label: string
  shortcut?: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuOption[]
  onClose: () => void
  className?: string
  minWidth?: number
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
  className = '',
  minWidth = 140
}: ContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: y, left: x })

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const padding = 8

    let adjustedX = x
    let adjustedY = y

    if (adjustedX + rect.width > window.innerWidth - padding) {
      adjustedX = Math.max(padding, window.innerWidth - rect.width - padding)
    }

    if (adjustedY + rect.height > window.innerHeight - padding) {
      adjustedY = Math.max(padding, window.innerHeight - rect.height - padding)
    }

    setPos({ top: adjustedY, left: adjustedX })
  }, [x, y, items.length])

  useEffect(() => {
    let active = true

    const handleClickOutside = (event: MouseEvent) => {
      if (!active) return
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const timer = setTimeout(() => {
      if (!active) return
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 50)

    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!items || items.length === 0) return null

  const content = (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className={`fixed z-[9999] bg-card/95 backdrop-blur-md border border-border/80 rounded-xl shadow-xl p-1 select-none animate-in fade-in zoom-in-95 duration-100 ${className}`}
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        minWidth: `${minWidth}px`,
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="flex flex-col gap-0.5">
        {items.map((item, idx) => {
          if (item.disabled) {
            return (
              <div
                key={item.id || idx}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-text-muted/40 cursor-not-allowed rounded-lg select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.icon && (
                    <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-40">
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.shortcut && (
                  <span className="text-[10px] text-text-muted/30 font-mono tracking-wider shrink-0 ml-2">
                    {item.shortcut}
                  </span>
                )}
              </div>
            )
          }

          return (
            <button
              key={item.id || idx}
              type="button"
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                item.onClick()
                onClose()
              }}
              className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${
                item.danger
                  ? 'text-error hover:bg-error/10 hover:text-error focus:bg-error/10 focus:text-error'
                  : 'text-text hover:bg-input/80 hover:text-accent focus:bg-input/80 focus:text-accent'
              } rounded-lg transition-colors cursor-pointer text-left w-full group focus:outline-none`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {item.icon && (
                  <span
                    className={`shrink-0 w-4 h-4 flex items-center justify-center transition-colors ${
                      item.danger
                        ? 'text-error group-hover:text-error'
                        : 'text-text-muted group-hover:text-accent group-focus:text-accent'
                    }`}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className="text-[10px] text-text-muted/60 group-hover:text-accent/80 font-mono tracking-wider shrink-0 ml-2">
                  {item.shortcut}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
}
