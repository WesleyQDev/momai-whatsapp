import { useTranslation } from 'react-i18next'
import { ScrollReveal } from './ScrollReveal'
import { LazyYouTube } from './LazyYouTube'

export function VideoSection() {
  const { t } = useTranslation()
  return (
    <ScrollReveal>
      <section className="video-section mx-auto max-w-[900px] px-8 py-16">
        <div className="mb-8 text-center">
          <h2 className="mb-3 font-flex text-3xl font-normal tracking-tight text-[var(--accent)]">{t('video.title')}</h2>
          <p className="text-base text-[var(--text-secondary)]">{t('video.subtitle')}</p>
        </div>
        <LazyYouTube videoId="fzyV0VCn_ZM" title="MomAI - Demo" />
      </section>
    </ScrollReveal>
  )
}
