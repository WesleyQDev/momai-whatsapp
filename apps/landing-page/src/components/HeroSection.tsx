import { Link } from 'react-router-dom'
import { WIN_STORE_URL } from '@/constants'
import { useOSDetection } from '@/hooks/useOSDetection'
import { useGitHubRelease } from '@/hooks/useGitHubRelease'
import { useDownloadTracking } from '@/hooks/useDownloadTracking'

export function HeroSection() {
  const { detectPlatform } = useOSDetection()
  const { urls } = useGitHubRelease()
  const { trackDownload } = useDownloadTracking()
  const os = detectPlatform()
  const isLinux = os === 'linux'
  const cleanVersion = urls.version.replace(/^v/, '')

  const heroHref = isLinux ? urls.linuxUrl : WIN_STORE_URL
  const heroText = isLinux ? 'Download para Linux' : 'Microsoft Store'
  const heroVersion = isLinux ? `v${cleanVersion}` : ''

  const handleHeroDownload = () => {
    trackDownload(heroText, heroHref.split('/').pop(), heroHref.split('.').pop())

    if (!isLinux) {
      // Protocolo ms-windows-store pode falhar em alguns navegadores
      // Espera 1.5s e redireciona para .exe se ainda estiver na mesma página
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.location.href = urls.winExeUrl
        }
      }, 1500)
    }
  }

  return (
    <section className="hero relative mx-auto flex max-w-[900px] flex-col items-center justify-center px-8 pb-16 pt-12 text-center">
      <div className="hero-logo relative mx-auto mb-4 flex h-[180px] w-[180px] items-center justify-center md:h-[180px] md:w-[180px]">
        <div className="hero-logo-ring absolute left-1/2 top-1/2 z-[1] h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full before:absolute before:left-1/2 before:top-1/2 before:h-full before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border before:border-[var(--accent)] before:opacity-0 before:content-[''] after:absolute after:left-1/2 after:top-1/2 after:h-full after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-[var(--accent)] after:opacity-0 after:content-['']" style={{ ['--tw-content' as string]: '' }} />
        <div className="hero-logo-shine pointer-events-none absolute left-1/2 top-1/2 z-[3] h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full" />
        <img src="/icon.gif" alt="MomAI" className="hero-logo-img relative z-[2] max-h-[160px] max-w-[160px] rounded-[20px] object-contain" loading="eager" />
      </div>

      <div className="badge mb-5 inline-block rounded-full border border-[rgba(138,180,248,0.2)] bg-[var(--gradient-subtle)] px-4 py-1 text-sm font-medium text-[var(--accent)]" style={{ animation: 'fadeInUp 0.8s ease-out forwards', opacity: 0 }}>
        100% Local & Privada
      </div>

      <h1 className="mb-6 font-flex text-5xl font-normal leading-[1.1] tracking-tight md:text-[4rem]" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'fadeInUp 1s ease-out 0.1s forwards', opacity: 0 }}>
        Sua assistente pessoal,<br />direto no seu computador.
      </h1>

      <p className="subtitle mb-10 max-w-[700px] text-lg font-normal leading-relaxed text-[var(--text-secondary)]" style={{ animation: 'fadeInUp 1s ease-out 0.2s forwards', opacity: 0 }}>
        A MomAI roda inteiramente na sua máquina. Sem assinaturas, sem coleta de dados, sem contas. Seus dados ficam com você, e ela só acessa a internet quando você pedir.
      </p>

      <div className="btn-group flex items-start gap-3" style={{ animation: 'fadeInUp 1s ease-out 0.3s forwards', opacity: 0 }}>
        <div className="cta-wrapper flex flex-col items-center gap-3">
          <a
            href={heroHref}
            id="heroDownloadBtn"
            onClick={handleHeroDownload}
            className="btn-download inline-flex items-center gap-2 rounded-full bg-white px-6 py-[0.7rem] text-sm font-semibold text-black no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            style={{ animation: 'softPulse 3s ease-in-out infinite' }}
          >
            {isLinux ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="relative z-[1] h-4 w-4 text-black">
                <path d="M12.001 0c-2.311 0-4.184 1.769-4.184 3.951 0 .61.144 1.185.401 1.693C5.556 6.845 3.82 9.079 3.82 11.405c0 1.259.511 2.457 1.439 3.324l.011.01.011-.004c.15.244.316.481.503.708l.006.008.006-.007a8.536 8.536 0 0 0 2.503 6.6l.004.004h1.002a2.41 2.41 0 0 1 1.458-.888l1.238-.284 1.238.284a2.41 2.41 0 0 1 1.458.888h1.002l.004-.004a8.536 8.536 0 0 0 2.503-6.6l.006.007.006-.008c.187-.227.353-.464.503-.708l.011.004.011-.01c.928-.867 1.439-2.065 1.439-3.324 0-2.326-1.736-4.56-4.397-5.761.257-.508.401-1.083.401-1.693C16.185 1.769 14.311 0 12.001 0zm0 1.2c1.648 0 2.984 1.232 2.984 2.751 0 .626-.226 1.21-.611 1.68l.004.004c-1.423-.451-2.924-.451-4.347 0l.004-.004a2.657 2.657 0 0 1-.611-1.68C9.417 2.432 10.753 1.2 12.001 1.2z"/>
              </svg>
            ) : (
              <img src="/Icone%20microsoft%20store.png" alt="Microsoft Store" className="relative z-[1] h-7 w-7" />
            )}
            <span className="relative z-[1]">{heroText}</span>
            {heroVersion && (
              <span className="relative z-[1] ml-2 text-sm font-normal opacity-70">{heroVersion}</span>
            )}
          </a>
          <a href="#download" className="text-sm text-[var(--text-secondary)] no-underline opacity-70 transition-all hover:text-[var(--accent)] hover:opacity-100 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            Outros downloads
          </a>
        </div>
        <Link to="/blog/post/v1-2-0" className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.15)] bg-transparent px-6 py-[0.7rem] text-sm font-medium text-[var(--text-secondary)] no-underline transition-all hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text)] hover:border-[rgba(255,255,255,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]">
          Saiba mais
        </Link>
      </div>

      <style>{`
        .hero-logo-ring::before { animation: waveRing 4s ease-out infinite; }
        .hero-logo-ring::after { animation: waveRing 4s ease-out infinite 1.5s; }
      `}</style>
    </section>
  )
}
