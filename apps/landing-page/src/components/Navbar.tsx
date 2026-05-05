import { WIN_STORE_URL } from '@/constants'
import { useTheme } from '@/hooks/useTheme'
import { useOSDetection } from '@/hooks/useOSDetection'
import { useGitHubRelease } from '@/hooks/useGitHubRelease'
import { useDownloadTracking } from '@/hooks/useDownloadTracking'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useState, useCallback } from 'react'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon } from './Icons'

const NAV_LINKS = [
  { to: '/blog', label: 'nav.blog' },
  { to: '/changelog', label: 'nav.changelog' },
  { to: '/extensoes', label: 'nav.extensoes' },
  { to: '/contato', label: 'nav.contato' },
  { to: '/reportar-erro', label: 'nav.reportarErro' },
]

export function Navbar() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { detectPlatform } = useOSDetection()
  const { urls } = useGitHubRelease()
  const { trackDownload } = useDownloadTracking()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const os = detectPlatform()
  const isLinux = os === 'linux'

  const navDownloadHref = isLinux ? urls.linuxUrl : WIN_STORE_URL
  const navDownloadText = isLinux ? t('nav.download') : t('nav.microsoftStore')

  const handleLinkClick = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const handleNavDownloadClick = useCallback(() => {
    trackDownload(navDownloadText, navDownloadHref.split('/').pop(), navDownloadHref.split('.').pop())

    if (!isLinux) {
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.location.href = urls.winExeUrl
        }
      }, 1500)
    }
  }, [trackDownload, navDownloadText, navDownloadHref, isLinux, urls.winExeUrl])

  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="sticky top-0 z-[100] flex h-16 w-full items-center justify-between px-8 backdrop-blur-xl transition-colors duration-300" style={{ background: 'var(--nav-bg)' }}>
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2 text-[1.1rem] font-medium tracking-tight text-[var(--text)] no-underline transition-opacity hover:opacity-80 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <img src="/icon.png" alt="MomAI" className="h-7 w-7 rounded-md" />
          MomAI
        </Link>
        <ul
          id="mobile-menu"
          className={`${menuOpen ? 'flex' : 'hidden'} absolute left-0 right-0 top-16 flex-col gap-0 border-b border-[var(--border-color)] bg-[var(--bg)] p-2 backdrop-blur-xl md:static md:flex md:flex-row md:gap-6 md:border-none md:bg-transparent md:p-0 ${menuOpen ? 'animate-slide-down' : ''}`}
        >
          {NAV_LINKS.map((link) => (
              <li key={link.to} className="w-full md:flex md:items-center md:w-auto">
              <Link
                to={link.to}
                onClick={handleLinkClick}
                className={`block px-8 py-4 text-base font-medium no-underline transition-colors md:px-0 md:py-0 md:text-sm md:font-normal focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  isActive(link.to) ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {t(link.label)}
              </Link>
            </li>
          ))}
          <li className="w-full md:flex md:items-center md:w-auto">
            <Link
              to="/doar"
              onClick={handleLinkClick}
              className="donate-link mx-4 my-2 block rounded-full px-4 py-2 text-center text-sm font-medium text-[#c58af9] no-underline transition-colors hover:bg-[rgba(197,138,249,0.25)] md:mx-0 md:my-0 md:px-4 md:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58af9]"
              style={{ animation: 'pulse-lilac 2s ease-in-out infinite', background: 'rgba(197,138,249,0.15)' }}
            >
              {t('nav.doar')}
            </Link>
          </li>
          <li className="mobile-nav-link w-full md:hidden">
            <a
              href="/saude/index.html"
              className="mx-4 mb-2 flex items-center gap-2 rounded-xl border-l-4 border-[#c58af9] bg-[rgba(197,138,249,0.1)] px-6 py-4 font-flex font-semibold text-[#c58af9] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58af9]"
            >
              <img src="/saude/icon.png" alt="Saúde" className="h-6 w-6 rounded-md" />
              {t('nav.saude')}
            </a>
          </li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/saude/index.html"
          className="hidden items-center gap-2 rounded-full px-3 py-1 text-[1.1rem] font-semibold tracking-tight text-[var(--text)] no-underline transition-opacity hover:opacity-80 md:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <img src="/saude/icon.png" alt="Saúde" className="h-7 w-7 rounded-md" />
          {t('nav.saude')}
        </a>

        <LanguageSwitcher />

        <button
          onClick={toggleTheme}
          aria-label="Alternar tema"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {theme === 'dark' ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
        </button>

        <a
          href={navDownloadHref}
          onClick={handleNavDownloadClick}
          className="btn-primary btn-download hidden items-center gap-2 rounded-full bg-white px-4 py-[0.45rem] text-sm font-semibold text-black no-underline transition-transform hover:-translate-y-0.5 md:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          style={{ animation: 'softPulse 3s ease-in-out infinite' }}
        >
          {!isLinux && (
            <img src="/Icone%20microsoft%20store.png" alt="Microsoft Store" className="h-[18px] w-[18px]" />
          )}
          <span>{navDownloadText}</span>
        </a>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text)] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] md:hidden"
        >
          {menuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
        </button>
      </div>
    </nav>
  )
}
