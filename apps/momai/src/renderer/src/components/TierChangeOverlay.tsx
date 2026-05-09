import logo from '../assets/icon.gif'

interface TierChangeOverlayProps {
  isChanging: boolean
  tier?: string | null
}

export default function TierChangeOverlay({ isChanging, tier }: TierChangeOverlayProps) {
  if (!isChanging) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-bg flex flex-col items-center justify-center p-6"
      style={{
        transition: 'opacity 0.3s ease-out',
        opacity: isChanging ? 1 : 0
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-bg" />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-500/5 rounded-full blur-[120px] animate-[pulse_6s_ease-in-out_infinite]" />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/5 rounded-full blur-[120px] animate-[pulse_6s_ease-in-out_infinite]"
          style={{ animationDelay: '3s' }}
        />
      </div>

      <div className="relative flex flex-col items-center animate-[fadeIn_1.5s_ease-out] w-full max-w-2xl px-6 text-center h-[70vh] justify-center mt-[-20vh]">
        <div className="relative mb-12">
          <div
            className="absolute inset-0 bg-violet-500/30 rounded-full blur-3xl animate-pulse"
            style={{ animationDuration: '4s' }}
          />
          <img
            src={logo}
            alt="MomAI"
            className="w-40 h-40 object-contain relative z-10 drop-shadow-[0_0_40px_rgba(167,139,250,0.4)]"
          />
        </div>

        <div className="flex flex-col items-center space-y-4 animate-in fade-in slide-in-from-bottom-10 duration-[1500ms] delay-500">
          <h1 className="text-4xl font-bold text-text tracking-tight leading-tight">
            Configurando <span className="text-accent uppercase">{tier || 'nova modalidade'}</span>
          </h1>

          <div className="bg-white/5 backdrop-blur-sm px-6 py-3 rounded-2xl border border-white/10 mt-2">
            <p className="text-sm font-medium text-text-muted leading-relaxed max-w-sm">
              Aplicando as configurações do modo{' '}
              <span className="text-accent font-bold">{tier || 'selecionado'}</span>...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
