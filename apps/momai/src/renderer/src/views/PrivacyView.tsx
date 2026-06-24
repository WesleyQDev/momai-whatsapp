import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import ConfirmDialog from '../components/floating/ConfirmDialog'
import { fetchExtensions } from '../services/api'

const PRIVACY_POLICY_URL = 'https://momaiassistente.studio/politicas-privacidade-momai.html'

function ShieldIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function PrivacyView() {
  const { t } = useI18n()
  const [whatsappInstalled, setWhatsappInstalled] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    let cancelled = false
    fetchExtensions()
      .then((list) => {
        if (cancelled) return
        const found = list.some(
          (e) =>
            (e.id === 'whatsapp' || e.id?.includes('whatsapp')) &&
            (e.installed === true || e.enabled === true)
        )
        setWhatsappInstalled(found)
      })
      .catch(() => {
        if (!cancelled) setWhatsappInstalled(false)
      })
    return () => {
      cancelled = true
    }
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
        {/* Header */}
        <div className="flex flex-col items-center px-4 pt-10 pb-8 text-center border-b border-white/5 bg-sidebar/10 backdrop-blur-sm">
          <div className="w-16 h-16 bg-accent/10 rounded-[2rem] flex items-center justify-center mb-4 border border-accent/20">
            <span className="text-accent">
              <ShieldIcon />
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 mb-4">
            <h1 className="text-2xl sm:text-3xl font-black text-text uppercase tracking-[0.3em]">
              {t('privacy.title')}
            </h1>
            <p className="text-[10px] text-accent font-bold tracking-[0.2em] uppercase opacity-80">
              {t('privacy.subtitle')}
            </p>
          </div>

          <div className="w-12 h-[2px] bg-accent/40 mb-5 rounded-full" />

          <p className="text-sm text-text-muted max-w-2xl leading-relaxed px-4">
            {t('privacy.intro')}
          </p>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto w-full p-6 sm:p-8 space-y-8">
          {/* What is stored locally */}
          <section>
            <h3 className="text-[11px] font-black text-text/70 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
              <div className="w-1.5 h-4 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />
              {t('privacy.stored.title')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Settings */}
              <div className="p-4 rounded-2xl bg-card/30 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <CheckIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.stored.settings.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.stored.settings.desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat history */}
              <div className="p-4 rounded-2xl bg-card/30 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <CheckIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.stored.chat.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.stored.chat.desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="p-4 rounded-2xl bg-card/30 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <CheckIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.stored.notes.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.stored.notes.desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reminders */}
              <div className="p-4 rounded-2xl bg-card/30 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <CheckIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.stored.reminders.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.stored.reminders.desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Observability */}
              <div className="p-4 rounded-2xl bg-card/30 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <CheckIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.stored.observability.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.stored.observability.desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* WhatsApp auth — only if installed */}
              {whatsappInstalled && (
                <div className="p-4 rounded-2xl bg-card/30 border border-white/5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                      <CheckIcon />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-text">
                        {t('privacy.stored.whatsapp.title')}
                      </h4>
                      <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                        {t('privacy.stored.whatsapp.desc')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* What is NOT stored */}
          <section>
            <h3 className="text-[11px] font-black text-text/70 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              {t('privacy.notStored.title')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                    <CrossIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.notStored.telemetry.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.notStored.telemetry.desc')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                    <CrossIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.notStored.accounts.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.notStored.accounts.desc')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                    <CrossIcon />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-text">
                      {t('privacy.notStored.tracking.title')}
                    </h4>
                    <p className="text-[11px] text-text-muted leading-relaxed mt-1">
                      {t('privacy.notStored.tracking.desc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Actions */}
          <section>
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
                  <DownloadIcon />
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
                  <TrashIcon />
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
          </section>

          {/* Privacy policy link */}
          <section className="text-center pt-2 pb-4">
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              {t('privacy.policyLink')}
              <ExternalIcon />
            </a>
            <p className="text-[10px] text-text-muted/50 mt-2">{PRIVACY_POLICY_URL}</p>
          </section>
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
