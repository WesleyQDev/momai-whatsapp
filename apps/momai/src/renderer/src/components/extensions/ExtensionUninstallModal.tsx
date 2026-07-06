import { useEffect } from 'react'

import { useI18n } from '../../i18n'

interface ExtensionUninstallModalProps {
  ext: { id: string; name: string }
  onConfirm: () => void
  onCancel: () => void
}

const TITLE_KEY = 'extensions.install.confirmUninstall.title'
const BODY_KEY = 'extensions.install.confirmUninstall.body'
const CANCEL_KEY = 'extensions.install.confirmUninstall.cancel'
const CONFIRM_KEY = 'extensions.install.confirmUninstall.confirm'

export default function ExtensionUninstallModal({
  ext,
  onConfirm,
  onCancel
}: ExtensionUninstallModalProps) {
  const { t } = useI18n()

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [onCancel])

  const titleTranslated = t(TITLE_KEY, { name: ext.name })
  const title = titleTranslated === TITLE_KEY ? `Desinstalar ${ext.name}?` : titleTranslated

  const bodyTranslated = t(BODY_KEY)
  const body = bodyTranslated === BODY_KEY ? 'Os dados salvos da extensão serão mantidos.' : bodyTranslated

  const cancelTranslated = t(CANCEL_KEY)
  const cancelLabel = cancelTranslated === CANCEL_KEY ? 'Cancelar' : cancelTranslated

  const confirmTranslated = t(CONFIRM_KEY)
  const confirmLabel = confirmTranslated === CONFIRM_KEY ? 'Desinstalar' : confirmTranslated

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-uninstall-modal-title"
        className="max-w-md w-full p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl"
      >
        <h2 id="extension-uninstall-modal-title" className="text-lg font-semibold text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
