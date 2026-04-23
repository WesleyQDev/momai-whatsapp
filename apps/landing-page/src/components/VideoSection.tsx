import { ScrollReveal } from './ScrollReveal'
import { LazyYouTube } from './LazyYouTube'

export function VideoSection() {
  return (
    <ScrollReveal>
      <section className="video-section mx-auto max-w-[900px] px-8 py-16">
        <LazyYouTube videoId="fzyV0VCn_ZM" title="MomAI - Demo" />
      </section>
    </ScrollReveal>
  )
}
