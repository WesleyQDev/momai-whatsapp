import { useTranslation } from 'react-i18next'

const CONTACTS = [
  {
    href: 'mailto:wesleyqueirozdeveloper@gmail.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 stroke-[var(--accent)]">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    title: 'Email',
    desc: 'wesleyqueirozdeveloper@gmail.com',
  },
  {
    href: 'https://github.com/Wesley-Developer-Studios',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-[var(--accent)]">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    title: 'GitHub',
    desc: 'Wesley Developer Studios',
  },
  {
    href: 'https://www.youtube.com/@WesleyDev',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-[var(--accent)]">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
    title: 'YouTube',
    desc: '@WesleyDev',
  },
  {
    href: 'https://github.com/WesleyQDev/MomAI-App',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-[var(--accent)]">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    title: 'Repositório',
    desc: 'github.com/WesleyQDev/MomAI-App',
  },
]

export function ContatoPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-[800px] px-8 py-24">
      <h1 className="mb-3 text-center font-flex text-5xl font-normal leading-[1.1] tracking-tight" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {t('contato.title')}
      </h1>
      <p className="mb-12 text-center text-lg text-[var(--text-secondary)]">
        {t('contato.subtitle')}
      </p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {CONTACTS.map((c) => (
          <a
            key={c.title}
            href={c.href}
            target={c.href.startsWith('mailto') ? undefined : '_blank'}
            rel={c.href.startsWith('mailto') ? undefined : 'noreferrer'}
            className="group block rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] p-8 text-center no-underline transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(138,180,248,0.2)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(138,180,248,0.15)] bg-[var(--gradient-subtle)]">
              {c.icon}
            </div>
            <h3 className="mb-1 text-base font-medium text-[var(--text)]">{c.title}</h3>
            <p className="text-sm text-[var(--text-secondary)]">{c.desc}</p>
          </a>
        ))}
      </div>

      <div className="mt-12 rounded-2xl bg-[var(--bg-secondary)] p-10 text-center">
        <h2 className="mb-3 font-flex text-2xl font-normal text-[var(--text)]">{t('contato.outrasDuvidas')}</h2>
        <p className="mb-6 text-[var(--text-secondary)]">
          {t('contato.githubDesc')}
        </p>
        <a
          href="https://github.com/WesleyQDev/MomAI-App/issues"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-[var(--accent)] no-underline transition-colors hover:text-[var(--accent-hover)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
            <circle cx={12} cy={12} r={10} />
            <line x1={12} y1={16} x2={12} y2={12} />
            <line x1={12} y1={8} x2={12.01} y2={8} />
          </svg>
          {t('contato.github')}
        </a>
      </div>
    </div>
  )
}
