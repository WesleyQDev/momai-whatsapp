import { useEffect, useState } from 'react'
import { ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'
import ConfirmDialog from '../components/floating/ConfirmDialog'

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function AboutView() {
  const { t } = useI18n()
  const [version, setVersion] = useState('...')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  const handleExport = async () => {
    setIsExporting(true)
    setFeedback(null)
    try {
      const result = await window.momaiAPI?.privacy?.exportData?.()
      if (result?.canceled) {
        setFeedback(null)
        return
      }
      if (!result || result.ok !== true) {
        throw new Error(result?.error || 'export failed')
      }
      const size = result.size ? ` (${formatBytes(result.size)})` : ''
      setFeedback({
        kind: 'success',
        message: `${t('privacy.export.success')}${size}`
      })
    } catch (e) {
      setFeedback({
        kind: 'error',
        message: t('privacy.export.error', { message: (e as Error)?.message || String(e) })
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleResetAll = async () => {
    setIsResetting(true)
    try {
      const result = await window.momaiAPI?.privacy?.deleteAll?.()
      if (!result || result.ok !== true) {
        throw new Error(result?.error || 'unknown error')
      }
      setShowResetConfirm(false)
      window.location.reload()
    } catch (e) {
      setFeedback({
        kind: 'error',
        message: t('settings.privacy.resetError', { message: (e as Error)?.message || String(e) })
      })
      throw e
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg/30">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Header Section - More Compact */}
        <div className="flex flex-col items-center px-4 pt-10 pb-8 text-center border-b border-white/5 bg-sidebar/10 backdrop-blur-sm">
          <div className="w-16 h-16 bg-accent/10 rounded-[2rem] flex items-center justify-center mb-4 border border-accent/20 animate-pulse-slow">
            <span className="text-2xl font-black text-accent tracking-tighter">M</span>
          </div>

          <div className="flex flex-col items-center gap-1 mb-4">
            <h1 className="text-2xl sm:text-3xl font-black text-text uppercase tracking-[0.3em]">
              MomAI
            </h1>
            <p className="text-[10px] text-accent font-bold tracking-[0.2em] uppercase opacity-80">
              {version}
            </p>
          </div>

          <div className="w-12 h-[2px] bg-accent/40 mb-5 rounded-full" />

          <p className="text-sm text-text-muted max-w-xl leading-relaxed px-4 mb-6">
            {t('about.description')}
          </p>

          <div className="flex flex-col items-center">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] opacity-40 mb-1">
              {t('about.developedBy')}
            </p>
            <p className="text-sm font-black text-text">Wesley Developer Studios</p>
          </div>

          <p className="text-[10px] text-text-muted/30 mt-4 font-medium px-4">
            {t('about.copyright')}
          </p>
        </div>

        {/* Content Section - Adjusted Gaps */}
        <div className="max-w-5xl mx-auto w-full p-6 sm:p-8">
          <h3 className="text-[11px] font-black text-text/70 mb-6 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1.5 h-4 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />
            {t('about.supportAndContact')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Email */}
            <a
              href="mailto:wesleyqueirozdeveloper@gmail.com"
              className="group flex flex-col items-center p-5 bg-card/30 border border-white/5 rounded-2xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-500">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-accent"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h4 className="text-[10px] font-black text-text uppercase tracking-widest mb-1">
                Email
              </h4>
              <p className="text-[9px] text-text-muted text-center opacity-50 leading-tight break-all">
                wesleyqueirozdeveloper@gmail.com
              </p>
            </a>

            {/* GitHub */}
            <a
              href="https://github.com/Wesley-Developer-Studios"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center p-5 bg-card/30 border border-white/5 rounded-2xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-500">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-accent"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <h4 className="text-[10px] font-black text-text uppercase tracking-widest mb-1">
                GitHub
              </h4>
              <p className="text-[9px] text-text-muted text-center opacity-50 leading-tight">
                Wesley Developer Studios
              </p>
            </a>

            {/* YouTube */}
            <a
              href="https://www.youtube.com/@WesleyDev"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center p-5 bg-card/30 border border-white/5 rounded-2xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-500">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-accent"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <h4 className="text-[10px] font-black text-text uppercase tracking-widest mb-1">
                YouTube
              </h4>
              <p className="text-[9px] text-text-muted text-center opacity-50 leading-tight">
                @WesleyDev
              </p>
            </a>

            {/* Site Oficial */}
            <a
              href="https://momaiassistente.studio/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center p-5 bg-card/30 border border-white/5 rounded-2xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-500">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-accent"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <h4 className="text-[10px] font-black text-text uppercase tracking-widest mb-1">
                {t('about.officialSite')}
              </h4>
              <p className="text-[9px] text-text-muted text-center opacity-50 leading-tight break-all">
                momaiassistente.studio
              </p>
            </a>
          </div>
        </div>

        {/* Your Data, Your Control — moved from the removed Privacy tab */}
        <div className="max-w-5xl mx-auto w-full p-6 sm:p-8">
          <h3 className="text-[11px] font-black text-text/70 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1.5 h-4 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />
            {t('privacy.actions.title')}
          </h3>

          <div className="rounded-2xl bg-card/30 border border-white/5 overflow-hidden">
            {/* Export */}
            <div className="flex items-center justify-between gap-4 p-4 border-b border-white/5">
              <div className="flex flex-col gap-0.5 pr-4 min-w-0">
                <span className="text-xs font-semibold text-text">
                  {t('privacy.export.title')}
                </span>
                <span className="text-[11px] text-text-muted font-medium leading-relaxed">
                  {t('privacy.export.desc')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/40 bg-accent/10 text-[11px] font-semibold text-accent uppercase tracking-wide hover:bg-accent/20 transition-colors active:scale-95 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                {isExporting ? t('privacy.export.working') : t('privacy.export.button')}
              </button>
            </div>

            {/* Reset */}
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex flex-col gap-0.5 pr-4 min-w-0">
                <span className="text-xs font-semibold text-text">
                  {t('settings.privacy.resetAllDataButtonLabel')}
                </span>
                <span className="text-[11px] text-text-muted font-medium leading-relaxed">
                  {t('settings.privacy.resetAllDataDesc')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null)
                  setShowResetConfirm(true)
                }}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-[11px] font-semibold text-red-400 uppercase tracking-wide hover:bg-red-500/20 hover:text-red-300 transition-colors active:scale-95"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                {t('settings.privacy.resetAllDataButton')}
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                feedback.kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>

        {/* Footer info - Minimal */}
        <div className="mt-auto py-6 px-6 text-center border-t border-white/5 bg-sidebar/5">
          <p className="text-[9px] text-text-muted/20 uppercase tracking-[0.4em] font-medium">
            Privacy First • Local Intelligence • MomAI Ecosystem
          </p>
        </div>
      </div>

      {showResetConfirm && (
        <ConfirmDialog
          variant="destructive"
          title={t('settings.privacy.confirmTitle')}
          description={t('settings.privacy.confirmDescription')}
          confirmText={t('settings.privacy.confirmButton')}
          cancelText={t('settings.privacy.cancelButton')}
          isLoading={isResetting}
          onConfirm={handleResetAll}
          onCancel={() => !isResetting && setShowResetConfirm(false)}
        />
      )}
    </div>
  )
}
