import { useTranslation } from 'react-i18next'
import { ScrollReveal } from './ScrollReveal'
import { HeartIcon, WalletIcon, LinkIcon, ChevronRightIcon } from './Icons'

const MOBILE_APPS = [
  {
    id: 'saude',
    name: 'MomAI Saúde',
    description: 'Monitore calorias, passos e hidratação com sua assistente de saúde pessoal. 100% privativo.',
    icon: HeartIcon,
    image: '/saude/icon.png',
    href: '/saude/index.html',
    color: '#c58af9',
    available: true,
  },
  {
    id: 'financas',
    name: 'MomAI Finanças',
    description: 'Controle seus gastos, organize orçamentos e receba insights inteligentes sobre suas finanças.',
    icon: WalletIcon,
    image: '/icon.png',
    href: '#',
    color: '#8ab4f8',
    available: false,
  },
  {
    id: 'conectar',
    name: 'MomAI Conectar',
    description: 'Sincronize seu desktop com o celular. Acesse lembretes, notas e conversas em qualquer lugar.',
    icon: LinkIcon,
    image: '/icon.png',
    href: '#',
    color: '#f981d3',
    available: false,
  },
]

export function MobileAppsSection() {
  const { t } = useTranslation()
  return (
    <section id="apps" className="relative mx-auto max-w-[1100px] px-8 py-24">
      <div className="section-title mx-auto mb-16 max-w-[480px] text-center">
        <h2 className="mb-3 font-flex text-3xl font-normal tracking-tight text-[var(--accent)]">{t('mobileApps.title')}</h2>
        <p className="text-base text-[var(--text-secondary)]">{t('mobileApps.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {MOBILE_APPS.map((app, i) => (
          <ScrollReveal key={app.id} delay={i * 0.1}>
            <div
              className={`group relative overflow-hidden rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] p-8 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] ${
                app.available ? 'hover:border-[rgba(138,180,248,0.3)]' : 'opacity-70'
              }`}
            >
              <div
                className="absolute right-0 top-0 h-[150px] w-[150px] translate-x-1/3 -translate-y-1/3 rounded-full opacity-0 blur-[60px] transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: `radial-gradient(circle, ${app.color}20 0%, transparent 70%)` }}
              />

              <div className="relative z-[1]">
                <div className="mb-6 flex items-center gap-4">
                  <img src={app.image} alt={app.name} className="h-14 w-14 rounded-xl object-contain" loading="lazy" />
                  <div>
                    <h3 className="text-lg font-medium text-[var(--text)]">{app.name}</h3>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${app.available ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}>
                      {app.available ? 'Disponível agora' : 'Em breve'}
                    </span>
                  </div>
                </div>

                <p className="mb-6 text-sm leading-relaxed text-[var(--text-secondary)]">{app.description}</p>

                {app.available ? (
                  <a
                    href={app.href}
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] no-underline transition-colors hover:text-[var(--accent-hover)] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    Conhecer o app <ChevronRightIcon className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="text-sm font-medium text-[var(--text-tertiary)]">Em breve</span>
                )}
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
