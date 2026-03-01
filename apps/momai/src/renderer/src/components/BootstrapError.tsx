interface BootstrapErrorProps {
  error: {
    type: string
    message: string
    details?: string
  }
}

const BootstrapError = ({ error }: BootstrapErrorProps) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-bg/95 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-card border border-red-500/30 rounded-xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-text">Erro de Inicialização</h2>
            <p className="text-xs text-text/50 uppercase tracking-wider">
              {error.type.replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        <p className="text-text/70 mb-4">{error.message}</p>

        {error.details && (
          <div className="bg-text/5 border border-text/10 rounded-lg p-3 mb-4">
            <p className="text-xs text-text/50 font-mono break-all">{error.details}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => window.electron.ipcRenderer.invoke('open-logs-folder')}
            className="flex-1 px-4 py-2 bg-text/5 hover:bg-text/10 border border-text/10 rounded-lg text-sm text-text/70 hover:text-text transition-colors"
          >
            Ver Logs
          </button>
          <button
            onClick={() => (window.location.href = window.location.pathname + '#/')}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm text-white font-medium transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    </div>
  )
}

export default BootstrapError
