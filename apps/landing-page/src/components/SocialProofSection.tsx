import { useTranslation } from 'react-i18next'
import { ScrollReveal } from './ScrollReveal'
import { StarIcon } from './Icons'
import { useGitHubStats } from '@/hooks/useGitHubStats'
import { GITHUB_REPO_URL } from '@/constants'

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return String(num)
}

export function SocialProofSection() {
  const { t } = useTranslation()
  const { stars, loading: starsLoading } = useGitHubStats()

  return (
    <section className="relative mx-auto max-w-[900px] px-8 py-12">
      <ScrollReveal>
        <div className="flex flex-wrap items-center justify-center gap-8 rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] px-8 py-6">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--text)] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <div className="flex items-center gap-1.5 rounded-full bg-[rgba(255,193,7,0.1)] px-3 py-1.5">
              <StarIcon className="h-4 w-4 text-[#ffc107]" />
              <span className="text-sm font-semibold text-[var(--text)]">
                {starsLoading ? '...' : formatNumber(stars)}
              </span>
            </div>
            <span className="text-sm">{t('socialProof.stars')}</span>
          </a>

          <div className="hidden h-8 w-px bg-[var(--feature-border)] sm:block" />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-[rgba(138,180,248,0.1)] px-3 py-1.5">
              <svg className="h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1={12} y1={15} x2={12} y2={3} />
              </svg>
              <span className="text-sm font-semibold text-[var(--text)]">
                +77
              </span>
            </div>
            <span className="text-sm text-[var(--text-secondary)]">
              {t('socialProof.instalacoes')}
            </span>
          </div>

          <div className="hidden h-8 w-px bg-[var(--feature-border)] sm:block" />

          <div className="flex items-center gap-2">
            <div className="flex h-2.5 w-2.5 items-center justify-center">
              <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-green-500" />
            </div>
            <span className="text-sm text-[var(--text-secondary)]">{t('socialProof.gratuito')}</span>
          </div>
        </div>
      </ScrollReveal>
    </section>
  )
}
