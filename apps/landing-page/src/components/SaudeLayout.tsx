import { Link, useLocation, Outlet } from "react-router-dom";
import { useState } from "react";

const SAUDE_NAV = [
  { to: "/saude/como-usar", label: "Como usar" },
  { to: "/saude/contato", label: "Contato" },
  { to: "/saude/reportar-erro", label: "Reportar Erro" },
];

const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.wesleyqdev.momaisaude&pcampaignid=web_share";

export function SaudeLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="relative z-10 min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[20%] h-[500px] w-[500px] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute -right-[20%] top-[30%] h-[400px] w-[400px] rounded-full bg-pink-900/20 blur-[120px]" />
        <div className="absolute bottom-[10%] left-[30%] h-[350px] w-[350px] rounded-full bg-blue-900/20 blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-[100] border-b border-white/5 bg-[#0d1117]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link
              to="/saude"
              className="flex items-center gap-2 text-[1.05rem] font-medium tracking-tight text-[#e6edf3] no-underline"
            >
              <img
                src="/saude/icon.png"
                alt="MomAI Saúde"
                className="h-7 w-7 rounded-md"
              />
              MomAI Saúde
            </Link>
            <ul className="hidden items-center gap-6 md:flex">
              {SAUDE_NAV.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={`text-sm no-underline transition-colors ${
                      isActive(link.to)
                        ? "text-[#10b981]"
                        : "text-[#8b949e] hover:text-[#e6edf3]"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/saude/doar"
                  className={`rounded-full px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
                    isActive("/saude/doar")
                      ? "bg-[rgba(16,185,129,0.25)] text-[#10b981]"
                      : "bg-[rgba(16,185,129,0.15)] text-[#10b981] hover:bg-[rgba(16,185,129,0.25)]"
                  }`}
                >
                  Doar
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-sm text-[#8b949e] no-underline transition-colors hover:border-white/20 hover:text-[#e6edf3] md:inline-flex"
            >
              <img src="/icon.png" alt="Desktop" className="h-5 w-5 rounded" />
              MomAI Desktop
            </Link>

            <a
              href={GOOGLE_PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-[#e6edf3] no-underline transition-colors hover:bg-white/20 md:inline-flex"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 1.33a1 1 0 010 1.74l-2.302 1.33-2.532-2.2 2.532-2.2zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
              </svg>
              Google Play
            </a>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 text-[#8b949e] transition-colors hover:text-[#e6edf3] md:hidden"
              aria-label="Menu"
            >
              {menuOpen ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-white/5 px-6 py-4 md:hidden">
            <ul className="flex flex-col gap-3">
              {SAUDE_NAV.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className={`block text-sm no-underline ${
                      isActive(link.to) ? "text-[#10b981]" : "text-[#8b949e]"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/saude/doar"
                  onClick={() => setMenuOpen(false)}
                  className="text-sm text-[#10b981] no-underline"
                >
                  Doar
                </Link>
              </li>
              <li className="border-t border-white/5 pt-3">
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 text-sm text-[#8b949e] no-underline"
                >
                  <img
                    src="/icon.png"
                    alt="Desktop"
                    className="h-5 w-5 rounded"
                  />
                  MomAI Desktop
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>

      <main className="relative z-10">
        <Outlet />
      </main>

      <footer className="relative z-10 border-t border-white/5 py-12">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <img
            src="/saude/icon.png"
            alt="MomAI Saúde"
            className="mx-auto mb-3 h-8 w-8 rounded-md"
          />
          <p className="mb-1 text-sm font-medium text-[#e6edf3]">
            Wesley Developer Studios
          </p>
          <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-sm text-[#8b949e]">
            <span>© 2026 MomAI Saúde</span>
            <a
              href="https://github.com/WesleyQDev"
              target="_blank"
              rel="noreferrer"
              className="text-[#8b949e] no-underline hover:text-[#e6edf3]"
            >
              GitHub
            </a>
            <a
              href="https://www.youtube.com/@WesleyDev"
              target="_blank"
              rel="noreferrer"
              className="text-[#8b949e] no-underline hover:text-[#e6edf3]"
            >
              YouTube
            </a>
            <Link
              to="/"
              className="text-[#8b949e] no-underline hover:text-[#e6edf3]"
            >
              Repositório
            </Link>
            <a
              href="https://github.com/WesleyQDev/momaisaude-privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="text-[#8b949e] no-underline hover:text-[#e6edf3]"
            >
              Política de Privacidade
            </a>
          </div>
          <p className="text-xs text-[#484f58]">
            Desenvolvido com foco em privacidade
          </p>
        </div>
      </footer>
    </div>
  );
}
