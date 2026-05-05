import { useTranslation } from 'react-i18next'
import { ScrollReveal } from './ScrollReveal'
import { MicrophoneIcon, ShieldIcon, ZapIcon, PuzzleIcon, ClockIcon, GlobeIcon } from './Icons'

const FEATURE_CONFIGS = [
  { icon: MicrophoneIcon, highlight: true },
  { icon: ShieldIcon, highlight: false },
  { icon: ZapIcon, highlight: false },
  { icon: PuzzleIcon, highlight: false },
  { icon: ClockIcon, highlight: false },
  { icon: GlobeIcon, highlight: false },
] as const

export function FeaturesSection() {
  const { t } = useTranslation()
  const features = t('features.items', { returnObjects: true }) as { title: string; desc: string }[]

  return (
    <section id="features" className="features-section relative bg-[var(--bg-secondary)] px-8 py-24">
      <div className="section-title mx-auto mb-16 max-w-[480px] text-center">
        <h2 className="mb-3 font-flex text-3xl font-normal tracking-tight text-[var(--accent)]">{t('features.title')}</h2>
        <p className="text-base text-[var(--text-secondary)]">{t('features.subtitle')}</p>
      </div>

      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {FEATURE_CONFIGS.map((config, i) => {
          const item = features[i]
          return (
            <ScrollReveal key={i} delay={i * 0.1}>
            <div
              className={`feature group relative overflow-hidden rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] p-7 transition-all duration-[400ms] hover:-translate-y-1 hover:border-[rgba(138,180,248,0.2)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] ${
                config.highlight
                  ? 'feature-luna border-[rgba(var(--accent-rgb),0.25)] bg-gradient-to-br from-[rgba(var(--accent-rgb),0.08)] to-[var(--bg-tertiary)] hover:border-[rgba(var(--accent-rgb),0.4)] hover:shadow-[0_20px_40px_rgba(var(--accent-rgb),0.1)]'
                  : ''
              }`}
            >
              {config.highlight && (
                <>
                  <div className="luna-glow pointer-events-none absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(var(--accent-rgb),0.2)_0%,transparent_70%)] opacity-0 blur-[40px] transition-opacity duration-400 group-hover:opacity-100" style={{ animation: 'lunaPulse 3s ease-in-out infinite' }} />
                  <div className="luna-particles pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-400 group-hover:opacity-100">
                    <span className="absolute left-[15%] top-[20%] h-[3px] w-[3px] rounded-full bg-[rgba(var(--accent-rgb),0.6)]" style={{ animation: 'lunaFloat 4s ease-in-out infinite' }} />
                    <span className="absolute left-[10%] top-[60%] h-[3px] w-[3px] rounded-full bg-[rgba(var(--accent-rgb),0.6)]" style={{ animation: 'lunaFloat 4s ease-in-out infinite 0.5s' }} />
                    <span className="absolute right-[15%] top-[30%] h-[3px] w-[3px] rounded-full bg-[rgba(var(--accent-rgb),0.6)]" style={{ animation: 'lunaFloat 4s ease-in-out infinite 1s' }} />
                    <span className="absolute right-[10%] top-[70%] h-[3px] w-[3px] rounded-full bg-[rgba(var(--accent-rgb),0.6)]" style={{ animation: 'lunaFloat 4s ease-in-out infinite 1.5s' }} />
                    <span className="absolute bottom-[25%] left-1/2 h-[3px] w-[3px] rounded-full bg-[rgba(var(--accent-rgb),0.6)]" style={{ animation: 'lunaFloat 4s ease-in-out infinite 2s' }} />
                  </div>
                </>
              )}

              <div className={`feature-icon relative z-[1] mb-5 flex h-11 w-11 items-center justify-center rounded-xl border bg-[var(--gradient-subtle)] ${config.highlight ? 'border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.15)]' : 'border-[rgba(138,180,248,0.15)]'}`}>
                <config.icon className={`h-[22px] w-[22px] stroke-[var(--accent)] ${config.highlight ? 'drop-shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]' : ''}`} />
              </div>

              <h3 className="relative z-[1] mb-2 text-base font-medium text-[var(--text)]">{item?.title}</h3>
              <p className="relative z-[1] text-sm leading-relaxed text-[var(--text-secondary)]">{item?.desc}</p>
            </div>
            </ScrollReveal>
          )
        })}
      </div>
    </section>
  )
}
