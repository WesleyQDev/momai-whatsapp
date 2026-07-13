import { WIN_STORE_URL } from "@/constants";
import { useTheme } from "@/hooks/useTheme";
import { useOSDetection } from "@/hooks/useOSDetection";
import { useGitHubRelease } from "@/hooks/useGitHubRelease";
import { useDownloadTracking } from "@/hooks/useDownloadTracking";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useState, useCallback, useRef } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon } from "./Icons";

const NAV_LINKS = [
  { to: "/blog", label: "nav.blog" },
  { to: "/changelog", label: "nav.changelog" },
  { to: "/extensoes", label: "nav.extensoes" },
  { to: "/contato", label: "nav.contato" },
  { to: "/reportar-erro", label: "nav.reportarErro" },
];

const GOOGLE_PLAY_SAUDE =
  "https://play.google.com/store/apps/details?id=com.wesleyqdev.momaisaude";
const GOOGLE_PLAY_FINANCAS =
  "https://play.google.com/store/apps/details?id=com.wesleyqdev.momaifinancas";
const GOOGLE_PLAY_MWSCAN =
  "https://play.google.com/store/apps/details?id=com.wesleydeveloperstudio.MWScan";

const GooglePlayIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 1.33a1 1 0 010 1.74l-2.302 1.33-2.532-2.2 2.532-2.2zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
  </svg>
);

const MsStoreIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
  </svg>
);

export function Navbar() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { detectPlatform } = useOSDetection();
  const { urls } = useGitHubRelease();
  const { trackDownload } = useDownloadTracking();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [produtosOpen, setProdutosOpen] = useState(false);
  const produtosTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const os = detectPlatform();
  const isLinux = os === "linux";

  const navDownloadHref = isLinux ? urls.linuxUrl : WIN_STORE_URL;
  const navDownloadText = isLinux ? t("nav.download") : t("nav.microsoftStore");

  const handleLinkClick = useCallback(() => {
    setMenuOpen(false);
    setProdutosOpen(false);
  }, []);

  const handleProdutosEnter = useCallback(() => {
    clearTimeout(produtosTimeoutRef.current);
    setProdutosOpen(true);
  }, []);

  const handleProdutosLeave = useCallback(() => {
    produtosTimeoutRef.current = setTimeout(() => setProdutosOpen(false), 150);
  }, []);

  const handleNavDownloadClick = useCallback(() => {
    trackDownload(
      navDownloadText,
      navDownloadHref.split("/").pop(),
      navDownloadHref.split(".").pop(),
    );

    if (!isLinux) {
      setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.href = urls.winExeUrl;
        }
      }, 1500);
    }
  }, [
    trackDownload,
    navDownloadText,
    navDownloadHref,
    isLinux,
    urls.winExeUrl,
  ]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="sticky top-0 z-[100] flex h-16 w-full items-center justify-between px-8 backdrop-blur-xl transition-colors duration-300"
      style={{ background: "var(--nav-bg)" }}
    >
      <div className="flex items-center gap-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-[1.1rem] font-medium tracking-tight text-[var(--text)] no-underline transition-opacity hover:opacity-80 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <img src="/icon.png" alt="MomAI" className="h-7 w-7 rounded-md" />
          MomAI
        </Link>
        <ul
          id="mobile-menu"
          className={`${menuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-16 flex-col gap-0 border-b border-[var(--border-color)] bg-[var(--bg)] p-2 backdrop-blur-xl md:static md:flex md:flex-row md:gap-6 md:border-none md:bg-transparent md:p-0 ${menuOpen ? "animate-slide-down" : ""}`}
        >
          {NAV_LINKS.map((link) => (
            <li
              key={link.to}
              className="w-full md:flex md:items-center md:w-auto"
            >
              <Link
                to={link.to}
                onClick={handleLinkClick}
                className={`block px-8 py-4 text-base font-medium no-underline transition-colors md:px-0 md:py-0 md:text-sm md:font-normal focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  isActive(link.to)
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                }`}
              >
                {t(link.label)}
              </Link>
            </li>
          ))}
          <li className="w-full md:hidden">
            <button
              onClick={() => setProdutosOpen(!produtosOpen)}
              className="flex w-full items-center gap-2 px-8 py-4 text-base font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text)] md:px-0 md:py-0 md:text-sm md:font-normal"
            >
              {t("nav.produtos")}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-4 w-4 transition-transform ${produtosOpen ? "rotate-180" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {produtosOpen && (
              <div className="flex flex-col gap-1 border-l-2 border-[var(--accent)] pl-4 ml-4 mb-2">
                <Link
                  to="/saude"
                  onClick={handleLinkClick}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                >
                  <img src="/saude/icon.png" alt="" className="h-5 w-5 rounded" />
                  {t("nav.saude")}
                  <GooglePlayIcon />
                </Link>
                <a
                  href={GOOGLE_PLAY_FINANCAS}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleLinkClick}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                >
                <img src="/financas-icon.png" alt="" className="h-5 w-5 rounded" />
                  {t("nav.financas")}
                  <GooglePlayIcon />
                </a>
                <a
                  href={GOOGLE_PLAY_MWSCAN}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleLinkClick}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                >
                  <img src="/mwscan-icon.png" alt="" className="h-5 w-5 rounded" />
                  {t("nav.mwscan")}
                  <GooglePlayIcon />
                </a>
                <Link
                  to="/"
                  onClick={handleLinkClick}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] no-underline hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                >
                  <img src="/icon.png" alt="" className="h-5 w-5 rounded" />
                  {t("nav.desktop")}
                  <MsStoreIcon />
                </Link>
              </div>
            )}
          </li>
          <li className="w-full md:flex md:items-center md:w-auto">
            <Link
              to="/doar"
              onClick={handleLinkClick}
              className="donate-link mx-4 my-2 block rounded-full px-4 py-2 text-center text-sm font-medium text-[#c58af9] no-underline transition-colors hover:bg-[rgba(197,138,249,0.25)] md:mx-0 md:my-0 md:px-4 md:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c58af9]"
              style={{
                animation: "pulse-lilac 2s ease-in-out infinite",
                background: "rgba(197,138,249,0.15)",
              }}
            >
              {t("nav.doar")}
            </Link>
          </li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="relative hidden md:block"
          onMouseEnter={handleProdutosEnter}
          onMouseLeave={handleProdutosLeave}
        >
          <button
            onClick={() => setProdutosOpen(!produtosOpen)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {t("nav.produtos")}
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 transition-transform ${produtosOpen ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {produtosOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-1.5 shadow-xl">
              <Link
                to="/saude"
                onClick={handleLinkClick}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] no-underline transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
              >
                <img src="/saude/icon.png" alt="" className="h-6 w-6 rounded" />
                <span className="flex-1">{t("nav.saude")}</span>
                <GooglePlayIcon />
              </Link>
              <a
                href={GOOGLE_PLAY_FINANCAS}
                target="_blank"
                rel="noreferrer"
                onClick={handleLinkClick}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] no-underline transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
              >
                <img src="/financas-icon.png" alt="" className="h-6 w-6 rounded" />
                <span className="flex-1">{t("nav.financas")}</span>
                <GooglePlayIcon />
              </a>
              <a
                href={GOOGLE_PLAY_MWSCAN}
                target="_blank"
                rel="noreferrer"
                onClick={handleLinkClick}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] no-underline transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
              >
                <img src="/mwscan-icon.png" alt="" className="h-6 w-6 rounded" />
                <span className="flex-1">{t("nav.mwscan")}</span>
                <GooglePlayIcon />
              </a>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <Link
                to="/"
                onClick={handleLinkClick}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-secondary)] no-underline transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
              >
                <img src="/icon.png" alt="" className="h-6 w-6 rounded" />
                <span className="flex-1">{t("nav.desktop")}</span>
                <MsStoreIcon />
              </Link>
            </div>
          )}
        </div>

        <LanguageSwitcher />

        <button
          onClick={toggleTheme}
          aria-label="Alternar tema"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {theme === "dark" ? (
            <SunIcon className="h-[18px] w-[18px]" />
          ) : (
            <MoonIcon className="h-[18px] w-[18px]" />
          )}
        </button>

        <a
          href={navDownloadHref}
          onClick={handleNavDownloadClick}
          className="btn-primary btn-download hidden items-center gap-2 rounded-full bg-white px-4 py-[0.45rem] text-sm font-semibold text-black no-underline transition-transform hover:-translate-y-0.5 md:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          style={{ animation: "softPulse 3s ease-in-out infinite" }}
        >
          {!isLinux && (
            <img
              src="/Icone%20microsoft%20store.png"
              alt="Microsoft Store"
              className="h-[18px] w-[18px]"
            />
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
          {menuOpen ? (
            <XMarkIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" />
          )}
        </button>
      </div>
    </nav>
  );
}
