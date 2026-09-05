import { useState } from 'react'
import { useI18n } from '../hooks/useI18n'

interface MonitoringDropdownProps {
  id: string
  monitoring: boolean
  onToggle: (id: string) => void
}

export default function MonitoringDropdown({ id, monitoring, onToggle }: MonitoringDropdownProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`py-1.5 px-3 rounded-full border border-border bg-card hover:bg-input text-text transition-all flex items-center gap-2 group ${
          open ? 'bg-input' : ''
        }`}
        title={monitoring ? t('page.monitored') : t('page.ignored')}
      >
        {monitoring ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted"
          >
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
            <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
            <path d="M18 8a6 6 0 0 0-9.33-5" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-40 rounded-xl border border-border bg-card shadow-2xl z-[100] py-1.5 overflow-hidden animate-in fade-in zoom-in duration-200">
          <button
            onClick={() => {
              if (!monitoring) onToggle(id)
              setOpen(false)
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
              monitoring
                ? 'bg-input text-text'
                : 'text-text-muted hover:bg-input hover:text-text'
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {t('page.monitored')}
          </button>
          <button
            onClick={() => {
              if (monitoring) onToggle(id)
              setOpen(false)
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
              !monitoring
                ? 'bg-input text-text'
                : 'text-text-muted hover:bg-input hover:text-text'
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
              <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
              <path d="M18 8a6 6 0 0 0-9.33-5" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
            {t('page.ignored')}
          </button>
        </div>
      )}
    </div>
  )
}
