import { WIN_STORE_URL } from '@/constants'
import { useGitHubRelease } from '@/hooks/useGitHubRelease'
import { useDownloadTracking } from '@/hooks/useDownloadTracking'
import { ScrollReveal } from './ScrollReveal'
import { WindowsIcon, LinuxIcon, AppleIcon, AndroidIcon, MonitorIcon, CpuIcon, MemoryIcon, GpuIcon } from './Icons'

const PLATFORMS = [
  { id: 'win', name: 'Windows (.exe)', icon: WindowsIcon, status: 'Instalar', disabled: false },
  { id: 'store', name: 'Microsoft Store', icon: () => <img src="/Icone%20microsoft%20store.png" alt="MS Store" className="h-8 w-8" />, status: 'Obter', disabled: false },
  { id: 'linux', name: 'Linux', icon: LinuxIcon, status: 'AppImage', disabled: false },
  { id: 'mac', name: 'macOS', icon: AppleIcon, status: 'Em breve', disabled: true },
  { id: 'android', name: 'Android', icon: AndroidIcon, status: 'Em breve', disabled: true },
]

export function DownloadSection() {
  const { urls, loading } = useGitHubRelease()
  const { trackDownload } = useDownloadTracking()
  const cleanVersion = urls.version.replace(/^v/, '')

  const getHref = (id: string) => {
    if (id === 'win') return urls.winExeUrl
    if (id === 'store') return WIN_STORE_URL
    if (id === 'linux') return urls.linuxUrl
    return '#'
  }

  const handlePlatformClick = (id: string, name: string) => {
    const href = getHref(id)
    trackDownload(name, href.split('/').pop(), href.split('.').pop())

    if (id === 'store') {
      // Fallback para .exe se o protocolo da loja falhar
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.location.href = urls.winExeUrl
        }
      }, 1500)
    }
  }

  return (
    <section id="download" className="cta-section relative overflow-hidden bg-[var(--bg-secondary)] px-8 py-24 text-center">
      <div className="section-title mx-auto mb-12 max-w-[480px]">
        <h2 className="relative mb-3 font-flex text-4xl font-normal tracking-tight text-[var(--accent)]">Pronto para experimentar?</h2>
        <p className="relative text-base text-[var(--text-secondary)]">Escolha sua plataforma e veja os requisitos para rodar a MomAI 100% local no seu hardware.</p>
      </div>

      <ScrollReveal>
        <div className="mega-download-container mx-auto max-w-[1100px]">
          <div className="mega-card flex overflow-hidden rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] shadow-[0_40px_100px_rgba(0,0,0,0.3)] backdrop-blur-xl [data-theme=light]:border-[rgba(0,0,0,0.05)] [data-theme=light]:bg-white [data-theme=light]:shadow-[0_20px_60px_rgba(0,0,0,0.05)]">
            {/* Downloads Column */}
            <div className="mega-card-downloads flex-[1.2] border-r border-[rgba(255,255,255,0.05)] p-12 [data-theme=light]:border-r-[rgba(0,0,0,0.05)] max-lg:border-b max-lg:border-r-0">
              <h3 className="mb-8 flex items-center gap-3 text-2xl font-semibold">
                <MonitorIcon className="h-6 w-6" />
                Plataformas
              </h3>

              <div className="flex flex-col gap-4">
                {PLATFORMS.map((p) => {
                  const href = getHref(p.id)

                  const statusText =
                    p.id === 'win' && !p.disabled
                      ? loading
                        ? 'Carregando...'
                        : `Instalar (v${cleanVersion})`
                      : p.id === 'linux' && !p.disabled
                        ? loading
                          ? 'Carregando...'
                          : `AppImage (v${cleanVersion})`
                        : p.status

                  return (
                    <a
                      key={p.id}
                      href={p.disabled ? undefined : href}
                      id={`${p.id}DownloadBtn`}
                      onClick={() => !p.disabled && handlePlatformClick(p.id, p.name)}
                      aria-disabled={p.disabled}
                      className={`platform-btn flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-6 py-5 text-[var(--text)] no-underline transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        p.disabled
                          ? 'disabled cursor-not-allowed opacity-40'
                          : 'hover:translate-x-2 hover:border-[var(--text)] hover:bg-[var(--text)] hover:text-[var(--bg)]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <p.icon className="h-6 w-6" />
                        <span className="text-lg font-medium">{p.name}</span>
                      </div>
                      <span className={`text-sm font-semibold uppercase tracking-wide ${p.disabled ? '' : 'text-[var(--accent)]'} platform-status`}>
                        {statusText}
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>

            {/* Specs Column */}
            <div className="mega-card-specs flex-1 bg-[rgba(255,255,255,0.01)] p-12">
              <h3 className="mb-8 flex items-center gap-3 text-2xl font-semibold">
                <MonitorIcon className="h-6 w-6" />
                Requisitos
              </h3>

              <div className="spec-group mb-8">
                <h4 className="mb-4 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--text-tertiary)]">Mínimos (Conversação)</h4>
                <div className="spec-item mb-3 flex items-start gap-3 text-sm">
                  <CpuIcon className="mt-0.5 h-4 w-4 text-[var(--accent)] opacity-70" />
                  <strong className="min-w-[80px] font-medium text-[var(--text)]">CPU:</strong>
                  <span className="text-[var(--text-secondary)]">Core i5 ou Ryzen 5</span>
                </div>
                <div className="spec-item mb-3 flex items-start gap-3 text-sm">
                  <MemoryIcon className="mt-0.5 h-4 w-4 text-[var(--accent)] opacity-70" />
                  <strong className="min-w-[80px] font-medium text-[var(--text)]">RAM:</strong>
                  <span className="text-[var(--text-secondary)]">8GB</span>
                </div>
                <div className="spec-item mb-3 flex items-start gap-3 text-sm">
                  <GpuIcon className="mt-0.5 h-4 w-4 text-[var(--accent)] opacity-70" />
                  <strong className="min-w-[80px] font-medium text-[var(--text)]">GPU:</strong>
                  <span className="text-[var(--text-secondary)]">Integrada ou Simples</span>
                </div>
              </div>

              <div className="spec-group">
                <h4 className="mb-4 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--text-tertiary)]">Recomendados (Alta performance)</h4>
                <div className="spec-item mb-3 flex items-start gap-3 text-sm">
                  <CpuIcon className="mt-0.5 h-4 w-4 text-[var(--accent)] opacity-70" />
                  <strong className="min-w-[80px] font-medium text-[var(--text)]">CPU:</strong>
                  <span className="text-[var(--text-secondary)]">i7 ou Ryzen 7+</span>
                </div>
                <div className="spec-item mb-3 flex items-start gap-3 text-sm">
                  <MemoryIcon className="mt-0.5 h-4 w-4 text-[var(--accent)] opacity-70" />
                  <strong className="min-w-[80px] font-medium text-[var(--text)]">RAM:</strong>
                  <span className="text-[var(--text-secondary)]">16GB+</span>
                </div>
                <div className="spec-item mb-3 flex items-start gap-3 text-sm">
                  <GpuIcon className="mt-0.5 h-4 w-4 text-[var(--accent)] opacity-70" />
                  <strong className="min-w-[80px] font-medium text-[var(--text)]">GPU:</strong>
                  <span className="text-[var(--text-secondary)]">RTX 2060+ / RX 6000+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  )
}
