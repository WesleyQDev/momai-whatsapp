import logo from '../assets/icon.gif'
import { useI18n } from '../i18n'

interface AssistantStatusProps {
  currentTier: string
  isThinking: boolean
}

export const AssistantStatus = ({ currentTier, isThinking }: AssistantStatusProps) => {
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center justify-center animate-fade-in shrink-0">
      {/* Container da Logo com Efeitos */}
      <div className="relative w-24 h-20 flex items-center justify-center overflow-visible">
        <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full opacity-40"></div>
        <img
          src={logo}
          alt="MomAI"
          draggable="false"
          className="w-20 h-20 object-contain relative z-10 drop-shadow-2xl select-none pointer-events-none"
        />
      </div>

      {/* Container de Status e Mensagens */}
      <div className="relative flex flex-col items-center -mt-3 animate-in fade-in slide-in-from-bottom-3 duration-700">
        {/* Partículas Animadas ao Redor */}
        <div className="absolute -inset-6 pointer-events-none">
          <div
            className="absolute top-1/2 left-0 w-1 h-1 rounded-full bg-accent/60 animate-pulse"
            style={{ animationDuration: '1.5s' }}
          />
          <div
            className="absolute top-1/2 right-0 w-1 h-1 rounded-full bg-accent/60 animate-pulse"
            style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}
          />
          <div
            className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-accent/40 animate-ping"
            style={{ animationDuration: '2s' }}
          />
          <div
            className="absolute bottom-0 left-1/2 w-1 h-1 rounded-full bg-accent/50 animate-pulse"
            style={{ animationDuration: '1.8s', animationDelay: '0.5s' }}
          />
        </div>

        <div className="relative">
          <div
            className="absolute -inset-3 bg-accent/20 blur-2xl animate-pulse"
            style={{ animationDuration: '3s' }}
          />
          <span className="relative text-[11px] font-bold text-text-muted/60 whitespace-nowrap">
            {(() => {
              if (currentTier === 'ultra' && isThinking) {
                return (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(var(--accent),0.6)]" />
                    <span className="text-accent font-black text-[11px] uppercase tracking-[0.15em] drop-shadow-[0_0_8px_rgba(var(--accent),0.4)]">
                      {t('assistantStatus.thinking')}
                    </span>
                  </div>
                )
              }
              if (currentTier === 'ultra') {
                return (
                  <span className="text-yellow-400/70 font-medium text-[11px] tracking-wide">
                    {t('assistantStatus.sayLuna')}
                  </span>
                )
              }
              if (currentTier === 'lite') {
                return (
                  <span className="text-emerald-400 font-black text-[11px] drop-shadow-[0_0_10px_rgba(52,211,153,0.4)] uppercase tracking-[0.15em]">
                    {t('assistantStatus.liteMode')}
                  </span>
                )
              }
              if (currentTier === 'pro') {
                return (
                  <span className="text-red-400 font-black text-[11px] drop-shadow-[0_0_10px_rgba(248,113,113,0.4)] uppercase tracking-[0.15em]">
                    {t('assistantStatus.proMode')}
                  </span>
                )
              }
              return (
                <span className="text-accent/60 font-black text-[11px] drop-shadow-[0_0_10px_rgba(var(--accent),0.4)] uppercase tracking-[0.15em]">
                  MomAI
                </span>
              )
            })()}
          </span>
        </div>
      </div>
    </div>
  )
}
