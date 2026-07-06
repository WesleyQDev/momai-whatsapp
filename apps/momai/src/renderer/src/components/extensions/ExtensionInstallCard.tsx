import type { InstallProgress, InstallError } from '../../services/api'
import { useI18n } from '../../i18n'

interface ExtensionInstallCardProps {
  progress?: InstallProgress
  error?: InstallError
  extName: string
  onDismiss?: () => void
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function ExtensionInstallCard({
  progress,
  error,
  extName,
  onDismiss
}: ExtensionInstallCardProps) {
  const { t } = useI18n()

  if (error) return <ErrorCard error={error} t={t} onDismiss={onDismiss} />
  if (progress) return <ProgressCard progress={progress} extName={extName} t={t} />
  return null
}

type TFunc = (key: string, vars?: Record<string, string | number>) => string

function ProgressCard({
  progress,
  extName,
  t
}: {
  progress: InstallProgress
  extName: string
  t: TFunc
}) {
  const installingLabel = t('extensions.installing') || `Instalando ${extName}`
  const stageLabel = t(`extensions.stages.${progress.stage}`)
  const { bytes_done, bytes_total, speed_bps, eta_seconds, global_percent } = progress

  let subLine: string | null = null
  if (typeof eta_seconds === 'number' && eta_seconds > 30) {
    subLine = t('extensions.install.eta_large') || 'Isso pode levar alguns instantes'
  } else if (bytes_done != null && bytes_total != null) {
    const parts: string[] = [`${formatBytes(bytes_done)} / ${formatBytes(bytes_total)}`]
    if (speed_bps != null) parts.push(`${formatBytes(speed_bps)}/s`)
    if (eta_seconds != null) {
      const seconds = Math.ceil(eta_seconds)
      const etaKey = t('extensions.install.eta_seconds', { seconds })
      parts.push(etaKey !== 'extensions.install.eta_seconds' ? etaKey : `${seconds}s restantes`)
    }
    subLine = parts.join(' · ')
  }

  return (
    <div className="w-full max-w-md p-3 rounded-xl bg-zinc-900 border border-white/5 text-zinc-100 shadow-xl flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-zinc-200 truncate max-w-[150px]">{extName}</span>
        <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider shrink-0">
          {stageLabel}
        </span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-amber-500 transition-all duration-200"
          style={{ width: `${global_percent}%` }}
        />
      </div>

      {subLine && (
        <div className="text-[10px] text-zinc-500 font-medium truncate">
          {subLine}
        </div>
      )}
    </div>
  )
}

function ErrorCard({
  error,
  t,
  onDismiss
}: {
  error: InstallError
  t: TFunc
  onDismiss?: () => void
}) {
  const title = t('extensions.install.error.title') || 'Erro ao instalar'

  let body: string
  switch (error.error) {
    case 'unknown_extension':
      body = 'Extensão não encontrada.'
      break
    case 'no_installable_release':
      body = 'Nenhuma versão instalável disponível para esta extensão.'
      break
    case 'incompatible_version': {
      const translated = t('extensions.install.incompatible', {
        version: error.release_version ?? '',
        range: error.required_range ?? ''
      })
      body =
        translated !== 'extensions.install.incompatible'
          ? translated
          : `Versão ${error.release_version} requer MomAI ${error.required_range}`
      break
    }
    case 'release_asset_missing':
      body = 'Arquivo ZIP indisponível no GitHub. Verifique a release.'
      break
    case 'release_not_found_by_version':
      body = 'Versão solicitada não existe'
      break
    default:
      body = error.message || error.error || 'Erro desconhecido'
  }

  return (
    <div className="w-full max-w-md p-3 rounded-xl bg-red-950/20 border border-red-800/40 text-zinc-100 shadow-xl flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 text-red-300 shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-red-200">{title}</div>
          <div className="mt-0.5 text-[10px] text-zinc-300 break-words line-clamp-2">{body}</div>
        </div>
      </div>

      {onDismiss && (
        <div className="flex justify-end shrink-0">
          <button
            type="button"
            onClick={onDismiss}
            className="px-2 py-0.5 rounded border border-red-700/40 bg-red-500/10 text-[9px] font-bold text-red-200 uppercase tracking-wide hover:bg-red-500/20 transition-colors"
          >
            {t('extensions.install.error.close') || 'Fechar'}
          </button>
        </div>
      )}
    </div>
  )
}
