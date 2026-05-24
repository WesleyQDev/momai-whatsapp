import { Link } from "react-router-dom";
import { GitHubIcon, YouTubeIcon } from "./Icons";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-[var(--bg-secondary)] px-8 py-16 text-center text-[var(--text-tertiary)]">
      <img
        src="/icon.png"
        alt="MomAI"
        className="mx-auto mb-4 h-16 w-16 rounded-2xl"
        loading="lazy"
      />
      <div className="mb-2 text-xl font-medium text-[var(--text)]">
        Wesley Developer Studios
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
        <span>{t("footer.direitos")}</span>
        <a
          href="https://github.com/WesleyQDev"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]"
        >
          <GitHubIcon className="h-5 w-5" />
          GitHub
        </a>
        <a
          href="https://www.youtube.com/@WesleyDev"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]"
        >
          <YouTubeIcon className="h-5 w-5" />
          YouTube
        </a>
        <a
          href="https://github.com/WesleyQDev/MomAI"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]"
        >
          {t("footer.repositorio")}
        </a>
        <Link
          to="/changelog"
          className="text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]"
        >
          {t("footer.changelog")}
        </Link>
        <a
          href="/politicas-privacidade-momai.html"
          className="text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--accent)]"
        >
          {t("footer.politica")}
        </a>
      </div>
      <div className="mt-8 text-sm text-[var(--text-tertiary)]">
        {t("footer.desenvolvido")}
      </div>
    </footer>
  );
}
