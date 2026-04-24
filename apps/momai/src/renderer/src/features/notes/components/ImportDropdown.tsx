import React from 'react'
import { DocumentPlusIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { useI18n } from '../../../i18n'

interface ImportDropdownProps {
  isOpen: boolean
  onClose: () => void
  onImportFiles: () => void
  onImportFolder: () => void
}

export default function ImportDropdown({
  isOpen,
  onClose,
  onImportFiles,
  onImportFolder
}: ImportDropdownProps) {
  const { t } = useI18n()

  if (!isOpen) return null

  return (
    <div
      className="absolute top-full left-0 mt-1 z-30 bg-card border border-border/10 rounded-lg shadow-xl py-1 min-w-[120px] flex flex-col animate-context-menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onImportFiles()
          onClose()
        }}
        className="text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2"
      >
        <DocumentPlusIcon className="w-3.5 h-3.5 opacity-70" />
        {t('notes.importFiles')}
      </button>
      <button
        onClick={() => {
          onImportFolder()
          onClose()
        }}
        className="text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2"
      >
        <ArrowUpTrayIcon className="w-3.5 h-3.5 opacity-70" />
        {t('notes.importFolder')}
      </button>
    </div>
  )
}
