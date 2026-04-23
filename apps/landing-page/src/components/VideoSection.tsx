import { ScrollReveal } from './ScrollReveal'

export function VideoSection() {
  return (
    <ScrollReveal>
      <section className="video-section mx-auto max-w-[900px] px-8 py-16">
        <div className="video-container relative overflow-hidden rounded-[20px] border border-[var(--feature-border)] bg-[var(--bg-tertiary)] shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="video-wrapper relative h-0 overflow-hidden pb-[56.25%]">
            <iframe
              src="https://www.youtube.com/embed/fzyV0VCn_ZM"
              title="MomAI - Demo"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute left-0 top-0 h-full w-full rounded-[19px]"
            />
          </div>
        </div>
      </section>
    </ScrollReveal>
  )
}
