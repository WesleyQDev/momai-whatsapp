import { useInstallProgressContext } from '../../stores/InstallProgressContext'

function formatSpeed(bps?: number | null): string {
  if (bps == null) return ''
  if (bps <= 0) return ''
  return bps > 1_048_576
    ? `${(bps / 1_048_576).toFixed(1)} MB/s`
    : `${(bps / 1024).toFixed(1)} KB/s`
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatETA(seconds?: number | null): string {
  if (seconds == null || seconds <= 0) return ''
  if (seconds > 120) return `${Math.round(seconds / 60)} min`
  return `${Math.ceil(seconds)}s`
}

function renderIcon(icon?: string): JSX.Element | null {
  if (!icon) return null
  if (icon.startsWith('<svg')) {
    return <span className="w-4 h-4 shrink-0" dangerouslySetInnerHTML={{ __html: icon }} />
  }
  if (icon.startsWith('http') || icon.startsWith('data:')) {
    return <img src={icon} alt="" className="w-4 h-4 rounded shrink-0" />
  }
  return <span className="w-4 h-4 flex items-center justify-center text-sm shrink-0">{icon}</span>
}

export default function GlobalInstallBar() {
  const { state, clearInstall } = useInstallProgressContext()

  if (!state.id || (!state.progress && !state.error)) return null

  const progress = state.progress
  const error = state.error
  const stage = progress?.stage

  const isDone = stage === 'done'
  const isDownloading = stage === 'downloading'
  const isInstalling = !isDone && !isDownloading && stage != null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {/* Baixando */}
      {progress && isDownloading && (
        <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-4 py-3 shadow-xl shadow-black/40 min-w-[260px] min-h-[72px]">
          <div className="flex items-center gap-2 mb-2">
            {renderIcon(state.icon)}
            <span className="text-sm font-semibold text-white truncate flex-1">{state.name}</span>
            <span className="text-xs text-emerald-400 font-medium">Baixando</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 rounded-full shadow-[0_0_4px_rgba(52,211,153,0.3)]"
                style={{ width: `${progress.global_percent ?? 0}%` }}
              />
            </div>
            <span className="text-xs font-bold text-emerald-400 tabular-nums shrink-0">
              {progress.global_percent ?? 0}%
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-500">
            {progress.bytes_done != null && progress.bytes_total != null && progress.bytes_total > 0 && (
              <span>{formatBytes(progress.bytes_done)} / {formatBytes(progress.bytes_total)}</span>
            )}
            {progress.speed_bps != null && progress.speed_bps > 0 && (
              <span className="text-emerald-400">{formatSpeed(progress.speed_bps)}</span>
            )}
            {progress.eta_seconds != null && progress.eta_seconds > 0 && (
              <span>{formatETA(progress.eta_seconds)}</span>
            )}
          </div>
        </div>
      )}

      {/* Instalando (indeterminado) */}
      {progress && isInstalling && (
        <div className="bg-zinc-900 border border-violet-700/40 rounded-xl px-4 py-3 shadow-xl shadow-black/40 min-w-[260px] min-h-[72px]">
          <div className="flex items-center gap-2 mb-2">
            {renderIcon(state.icon)}
            <span className="text-sm font-semibold text-white truncate flex-1">{state.name}</span>
            <span className="text-xs text-violet-400 font-medium">Instalando</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full animate-pulse"
              style={{ width: '100%' }}
            />
          </div>
          <div className="h-[18px]" /> {/* spacer to match Baixando height */}
        </div>
      )}

      {/* Instalado */}
      {isDone && (
        <div className="bg-zinc-900 border border-emerald-700/40 rounded-xl px-4 py-3 shadow-xl shadow-black/40 min-w-[260px] min-h-[72px]">
          <div className="flex items-center gap-2 min-h-[20px]">
            {renderIcon(state.icon)}
            <span className="text-sm font-semibold text-white truncate flex-1">{state.name}</span>
            <span className="text-xs text-emerald-400 font-medium">Instalado</span>
          </div>
          <div className="h-2 rounded-full bg-transparent" />
          <div className="h-[18px]" />
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="bg-zinc-900 border border-red-700/40 rounded-xl px-4 py-3 shadow-xl shadow-black/40 min-w-[260px] min-h-[72px]">
          <div className="flex items-start gap-2">
            {renderIcon(state.icon)}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-white">{state.name}</span>
              <p className="text-xs text-red-400 mt-0.5">
                {error.error === 'incompatible_version'
                  ? 'Incompatível com esta versão da MomAI'
                  : error.message || error.error}
              </p>
            </div>
            <button
              onClick={clearInstall}
              className="text-xs font-semibold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
