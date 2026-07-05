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
  icon_url?: string;
  icon_bg?: string;
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
  const [starsMap, setStarsMap] = useState<Record<string, number>>({});
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(
    null,
  );
  const [manifestLoading, setManifestLoading] = useState(false);

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
    if (extensions.length === 0) return;
    const fetchStars = async () => {
      const results = await Promise.all(
        extensions.map(async (ext) => {
          if (!ext.repo) return { id: ext.id, stars: 0 };
          try {
            const res = await fetch(
              `https://api.github.com/repos/${ext.repo}`,
            );
            if (!res.ok) return { id: ext.id, stars: 0 };
            const data = await res.json();
            return { id: ext.id, stars: data.stargazers_count || 0 };
          } catch {
            return { id: ext.id, stars: 0 };
          }
        }),
      );
      setStarsMap(
        Object.fromEntries(results.map((r) => [r.id, r.stars])),
      );
    };
    fetchStars();
  }, [extensions]);

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
    if (!selectedExtension) return;
    setManifest(null);
    setManifestLoading(true);
    fetch(
      `https://raw.githubusercontent.com/${selectedExtension.repo}/main/manifest.json`,
    )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setManifest(data);
        setManifestLoading(false);
      })
      .catch(() => {
        setManifestLoading(false);
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
    const extStars = starsMap[selectedExtension.id] || 0;
    const iconBgStyle = selectedExtension.icon_bg
      ? { background: selectedExtension.icon_bg }
      : undefined;
    const authorUsername = selectedExtension.repo?.split("/")[0] || selectedExtension.author;
    return (
      <div className="relative mx-auto max-w-4xl px-6 py-16 sm:px-8 lg:px-12">
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
          className="group mb-10 flex items-center gap-2 text-[11px] font-bold text-[var(--text-tertiary)] transition-all hover:text-[var(--text)] uppercase tracking-widest"
        >
          <svg
            className="w-3 h-3 transition-transform duration-300 group-hover:-translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t("extensoes.voltar")}
        </button>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-8 pb-8 border-b border-[var(--border-color)]">
          <div
            className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl ${iconBgStyle ? '' : `bg-gradient-to-br ${gradClass}`} shadow-xl flex items-center justify-center shrink-0 relative overflow-hidden`}
            style={iconBgStyle}
          >
            <div className="absolute inset-0 bg-white/[0.08]" />
            <div className="relative z-10">
              {getIcon(selectedExtension.icon, selectedExtension.icon_url)}
            </div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 mb-3">
              <h1 className="text-2xl md:text-3xl font-bold text-[var(--text)] tracking-tight">
                {name}
              </h1>
              <span className="inline-flex items-center self-center md:self-auto rounded-full border border-[rgba(var(--accent-rgb),0.15)] bg-[rgba(var(--accent-rgb),0.08)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {selectedExtension.category}
              </span>
            </div>

            <p className="text-sm text-[var(--text-secondary)] font-medium mb-6 max-w-2xl leading-relaxed">
              {description}
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-5 mb-6">
              <div className="flex flex-col">
                <span className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-tighter mb-1">
                  {t("extensoes.autor")}
                </span>
                <div className="flex items-center gap-2">
                  <img
                    src={`https://avatars.githubusercontent.com/${encodeURIComponent(authorUsername)}?s=64`}
                    alt="Author"
                    className="w-6 h-6 rounded-full border border-[var(--border-color)] object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes("github.png")) {
                        target.src = "https://github.com/github.png?size=64";
                      }
                    }}
                  />
                  <span className="text-sm text-[var(--text)] font-bold">
                    {selectedExtension.author}
                  </span>
                </div>
              </div>
              <div className="w-px h-6 bg-[var(--border-color)]" />
              <div className="flex flex-col">
                <span className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-tighter">
                  {t("extensoes.versao")}
                </span>
                <span className="text-xs text-[var(--text-secondary)] font-bold">
                  v{selectedExtension.version}
                </span>
              </div>
              <div className="w-px h-6 bg-[var(--border-color)]" />
              <div className="flex flex-col">
                <span className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-tighter">
                  GitHub Stars
                </span>
                {extStars > 0 ? (
                  <div className="flex items-center gap-1.5 text-sm text-amber-400 font-bold">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    {extStars}
                  </div>
                ) : (
                  <span className="text-xs text-[var(--text-tertiary)] font-bold">N/A</span>
                )}
              </div>
            </div>

            {selectedExtension.repo && (
              <a
                href={`https://github.com/${selectedExtension.repo}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl text-[10px] font-bold hover:text-[var(--text)] hover:border-[var(--accent)]/30 transition-all uppercase tracking-widest no-underline"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent" />
              <div className="pt-10">
                <h2 className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t("extensoes.sobre")}
                </h2>
                <div className="rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)]/60 p-8 backdrop-blur-xl">
                  {readmeLoading && (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
                        <svg className="h-8 w-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

          <aside className="w-full lg:w-80 shrink-0 space-y-4">
            {(manifest?.permissions as string[] | undefined)?.length ? (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg)]/80 p-5 backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
                    <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">{t("extensoes.permissoes")}</h3>
                    <p className="text-[11px] text-[var(--text-tertiary)]">{t("extensoes.permissoesDesc")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(manifest.permissions as string[]).map((perm) => (
                    <span key={perm} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/15 bg-amber-500/8 px-2.5 py-1 text-xs font-semibold text-amber-300">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                      </svg>
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {(manifest?.storage as { description?: string; locations?: string[] } | undefined) ? (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg)]/80 p-5 backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10">
                    <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">{t("extensoes.armazenamento")}</h3>
                    <p className="text-[11px] text-[var(--text-tertiary)]">{t("extensoes.armazenamentoDesc")}</p>
                  </div>
                </div>
                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                  {(manifest.storage as { description?: string }).description}
                </p>
                {(manifest.storage as { locations?: string[] }).locations?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {(manifest.storage as { locations: string[] }).locations.map((loc) => (
                      <span key={loc} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/15 bg-blue-500/8 px-2.5 py-1 text-xs font-semibold text-blue-300 font-mono">
                        {loc}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(manifest?.voiceHooks as Record<string, unknown> | undefined) ? (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg)]/80 p-5 backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10">
                    <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">{t("extensoes.voz")}</h3>
                    <p className="text-[11px] text-[var(--text-tertiary)]">{t("extensoes.vozDesc")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(manifest.voiceHooks as Record<string, unknown>).map((hook) => (
                    <span key={hook} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/15 bg-purple-500/8 px-2.5 py-1 text-xs font-semibold text-purple-300">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                      {hook}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
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
                  iconUrl={ext.icon_url}
                  iconBg={ext.icon_bg}
                  stars={starsMap[ext.id]}
                  repo={ext.repo}
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
