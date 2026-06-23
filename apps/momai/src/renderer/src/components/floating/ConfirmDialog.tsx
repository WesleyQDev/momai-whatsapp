import React, { useEffect, useState } from 'react'
import FloatingCard from './FloatingCard'

export type ConfirmDialogVariant = 'default' | 'destructive'

interface ConfirmDialogProps {
  title: string
  description: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: ConfirmDialogVariant
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

/**
 * Generic confirmation dialog used for destructive or important actions.
 * Wraps FloatingCard so it renders as a centered modal with a backdrop.
 *
 * Keyboard:
 *   - Escape → onCancel
 *   - Enter  → onConfirm (skipped while isLoading to prevent double-submit)
 */
export default function ConfirmDialog({
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    if (busy || isLoading) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter' && !isLoading) {
        e.preventDefault()
        void handleConfirm()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, isLoading])

  const confirmClasses =
    variant === 'destructive'
      ? 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25 hover:text-red-300'
      : 'bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25'

  return (
    <FloatingCard title={title} onClose={isLoading ? undefined : onCancel} width="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed text-text-muted">{description}</div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-text-muted hover:text-text hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${confirmClasses}`}
          >
            {isLoading ? 'Working…' : confirmText}
          </button>
        </div>
      </div>
    </FloatingCard>
  )
}
