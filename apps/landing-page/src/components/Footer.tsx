import { Link } from 'react-router-dom'
import { GitHubIcon, YouTubeIcon } from './Icons'

export function Footer() {
  return (
    <footer className="bg-[var(--bg-secondary)] px-8 py-16 text-center text-[var(--text-tertiary)]">
      <img src="/icon.png" alt="MomAI" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
      <div className="mb-2 text-xl font-medium text-[var(--text)]">Wesley Developer Studios</div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
        <span>© 2026 MomAI</span>
        <a href="https://github.com/WesleyQDev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]">
          <GitHubIcon className="h-5 w-5" />
          GitHub
        </a>
        <a href="https://www.youtube.com/@WesleyDev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]">
          <YouTubeIcon className="h-5 w-5" />
          YouTube
        </a>
        <a href="https://github.com/WesleyQDev/MomAI" target="_blank" rel="noreferrer" className="text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]">
          Repositório
        </a>
        <Link to="/changelog" className="text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]">
          Changelog
        </Link>
        <a href="/politicas-privacidade.html" className="text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]">
          Política de Privacidade
        </a>
      </div>
      <div className="mt-8 text-sm text-[var(--text-tertiary)]">Desenvolvido com foco em privacidade</div>
    </footer>
  )
}
