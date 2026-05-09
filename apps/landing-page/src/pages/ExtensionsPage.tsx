import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  ExtensionCard,
  getIcon,
  getGradient,
} from "../components/ExtensionCard";

interface Extension {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  author: string;
  repo: string;
  download_url: string;
  version: string;
  locales?: Record<string, { name: string; description: string }>;
}

export function ExtensionsPage() {
  const { t, i18n } = useTranslation();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(
    null,
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [readme, setReadme] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeError, setReadmeError] = useState(false);

  useEffect(() => {
    fetch(
      "https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json",
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: Extension[]) => {
        setExtensions(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedExtension) return;
    setReadme(null);
    setReadmeLoading(true);
    setReadmeError(false);
    fetch(
      `https://raw.githubusercontent.com/${selectedExtension.repo}/main/README.md`,
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((text) => {
        setReadme(text);
        setReadmeLoading(false);
      })
      .catch(() => {
        setReadmeError(true);
        setReadmeLoading(false);
      });
  }, [selectedExtension]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedExtension) setSelectedExtension(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedExtension]);

  const locale = i18n.language?.startsWith("pt") ? "pt-BR" : i18n.language;

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    extensions.forEach((e) => tags.add(e.category));
    return Array.from(tags).sort();
  }, [extensions]);

  const filteredExtensions = useMemo(() => {
    if (!activeTag) return extensions;
    return extensions.filter((e) => e.category === activeTag);
  }, [extensions, activeTag]);

  function getLocalized(ext: Extension) {
    const localized = ext.locales?.[locale];
    return {
      name: localized?.name ?? ext.name,
      description: localized?.description ?? ext.description,
    };
  }

  if (selectedExtension) {
    const { name, description } = getLocalized(selectedExtension);
    const gradClass = getGradient(name);
    return (
      <div className="relative mx-auto max-w-3xl px-6 py-16 sm:px-8 lg:px-12">
        <div
          className="pointer-events-none fixed inset-0 overflow-hidden"
          aria-hidden
        >
          <div
            className={`absolute -left-40 top-40 h-96 w-96 rounded-full opacity-10 blur-[120px] ${gradClass.replace("from-", "bg-").replace("to-", "").split(" ")[0]}`}
          />
        </div>

        <button
          onClick={() => setSelectedExtension(null)}
          className="group mb-10 flex items-center gap-2 text-sm font-medium text-[var(--text-tertiary)] transition-all hover:text-[var(--text)]"
        >
          <svg
            className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t("extensoes.voltar")}
        </button>

        <div className="mb-14 flex flex-col gap-8 sm:flex-row sm:items-start">
          <div
            className={`relative flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradClass} shadow-2xl shadow-black/30`}
          >
            <div className="absolute inset-0 rounded-2xl bg-white/[0.08]" />
            <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
            {getIcon(selectedExtension.icon)}
          </div>

          <div className="flex-1">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-[var(--text)]">{name}</h1>
              <span className="inline-flex items-center rounded-full border border-[rgba(var(--accent-rgb),0.15)] bg-[rgba(var(--accent-rgb),0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--accent)] backdrop-blur-sm">
                {selectedExtension.category}
              </span>
            </div>

            <p className="mb-7 text-base leading-relaxed text-[var(--text-secondary)]">
              {description}
            </p>

            <div className="mb-7 flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--feature-border)] bg-[var(--bg-tertiary)]">
                  <svg
                    className="h-4 w-4 text-[var(--text-secondary)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {t("extensoes.autor")}
                  </span>
                  <span className="text-sm font-medium text-[var(--text)]">
                    {selectedExtension.author}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--feature-border)] bg-[var(--bg-tertiary)]">
                  <svg
                    className="h-4 w-4 text-[var(--text-secondary)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {t("extensoes.versao")}
                  </span>
                  <span className="text-sm font-medium text-[var(--text)]">
                    v{selectedExtension.version}
                  </span>
                </div>
              </div>
            </div>

            {selectedExtension.repo && (
              <a
                href={`https://github.com/${selectedExtension.repo}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2.5 rounded-xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)]/80 px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] no-underline backdrop-blur-xl transition-all hover:border-[var(--accent)]/30 hover:text-[var(--text)] hover:shadow-[0_0_20px_-5px_rgba(var(--accent-rgb),0.1)]"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("extensoes.github")}
              </a>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent" />

          <div className="pt-10">
            <h2 className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <svg
                className="h-4 w-4 text-[var(--accent)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {t("extensoes.sobre")}
            </h2>
            <div className="rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)]/60 p-8 backdrop-blur-xl">
              {readmeLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {t("extensoes.loading")}
                  </div>
                </div>
              )}
              {readmeError && (
                <p className="text-center text-sm text-[var(--text-tertiary)]">
                  {t("extensoes.readmeError")}
                </p>
              )}
              {readme && !readmeLoading && (
                <div
                  className="prose prose-invert max-w-none
                    prose-headings:text-[var(--text)] prose-headings:font-semibold prose-headings:mt-8 prose-headings:mb-4
                    prose-p:text-[var(--text-secondary)] prose-p:text-sm prose-p:leading-relaxed prose-p:mb-4
                    prose-li:text-[var(--text-secondary)] prose-li:text-sm
                    prose-strong:text-[var(--text)]
                    prose-code:text-[var(--accent)] prose-code:bg-[var(--bg-secondary)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                    prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline
                    prose-pre:bg-[var(--bg-secondary)] prose-pre:border prose-pre:border-[var(--border-color)] prose-pre:rounded-lg
                    prose-blockquote:border-l-[var(--accent)] prose-blockquote:text-[var(--text-secondary)] prose-blockquote:bg-[var(--bg-secondary)] prose-blockquote:rounded-r-lg
                    prose-hr:border-[var(--border-color)]
                    prose-table:text-[var(--text-secondary)]
                    prose-th:text-[var(--text)] prose-th:border-b-[var(--border-color)]
                    prose-td:border-b-[var(--border-color)]"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(marked.parse(readme) as string),
                  }}
                />
              )}
              {!readme && !readmeLoading && !readmeError && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-secondary)]">
                    <svg
                      className="h-8 w-8 text-[var(--text-tertiary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm italic text-[var(--text-tertiary)]">
                    {t("extensoes.readmeEmpty")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl px-6 py-24 sm:px-8 lg:px-12">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-40 top-96 h-96 w-96 rounded-full bg-[var(--accent)] opacity-[0.03] blur-[120px]" />
        <div className="absolute -right-40 top-48 h-80 w-80 rounded-full bg-[var(--accent)] opacity-[0.02] blur-[100px]" />
      </div>

      <div className="relative mb-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-transparent ring-1 ring-[var(--accent)]/10 backdrop-blur-xl">
          <svg
            className="h-7 w-7 text-[var(--accent)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17l-5.384 5.384a2.25 2.25 0 01-3.182-3.182l5.384-5.384m3.182 3.182a11.19 11.19 0 01-3.182-7.87m3.182 7.87a11.19 11.19 0 007.87-3.182m-7.87 3.182l7.87-7.87m-7.87 7.87a11.19 11.19 0 01-3.182-7.87m3.182 7.87a11.19 11.19 0 007.87-3.182"
            />
          </svg>
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
          {t("extensoes.title")}
        </h1>
        <p className="text-lg text-[var(--text-secondary)]">
          {t("extensoes.subtitle")}
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {t("extensoes.loading")}
          </div>
        </div>
      )}
      {error && (
        <p className="py-20 text-center text-[var(--text-tertiary)]">
          {t("extensoes.error")}
        </p>
      )}
      {!loading && !error && extensions.length === 0 && (
        <p className="py-20 text-center text-[var(--text-tertiary)]">
          {t("extensoes.empty")}
        </p>
      )}

      {!loading && !error && extensions.length > 0 && (
        <>
          <div className="mb-10 flex items-center gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setActiveTag(null)}
              className={`shrink-0 rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-wide transition-all duration-300 ${
                !activeTag
                  ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_15px_-3px_rgba(var(--accent-rgb),0.15)]"
                  : "border-[var(--feature-border)] bg-[var(--bg-tertiary)]/60 text-[var(--text-tertiary)] backdrop-blur-sm hover:border-[var(--accent)]/20 hover:text-[var(--text)]"
              }`}
            >
              {t("extensoes.todas")}
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`shrink-0 rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-wide transition-all duration-300 ${
                  activeTag === tag
                    ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] shadow-[0_0_15px_-3px_rgba(var(--accent-rgb),0.15)]"
                    : "border-[var(--feature-border)] bg-[var(--bg-tertiary)]/60 text-[var(--text-tertiary)] backdrop-blur-sm hover:border-[var(--accent)]/20 hover:text-[var(--text)]"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredExtensions.map((ext) => {
              const { name, description } = getLocalized(ext);
              return (
                <ExtensionCard
                  key={ext.id}
                  name={name}
                  description={description}
                  category={ext.category}
                  author={ext.author}
                  version={ext.version}
                  icon={ext.icon}
                  onClick={() => setSelectedExtension(ext)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
