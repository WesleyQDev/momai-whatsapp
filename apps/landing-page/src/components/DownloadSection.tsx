import { useTranslation } from "react-i18next";
import { WIN_STORE_URL } from "@/constants";
import { useGitHubRelease } from "@/hooks/useGitHubRelease";
import { useDownloadTracking } from "@/hooks/useDownloadTracking";
import { ScrollReveal } from "./ScrollReveal";
import {
  WindowsIcon,
  LinuxIcon,
  AppleIcon,
  AndroidIcon,
  MonitorIcon,
} from "./Icons";

const PLATFORMS = [
  {
    id: "win",
    name: "Windows (.exe)",
    icon: WindowsIcon,
    status: "Instalar",
    disabled: false,
  },
  {
    id: "store",
    name: "Microsoft Store",
    icon: () => (
      <img
        src="/Icone%20microsoft%20store.png"
        alt="MS Store"
        className="h-8 w-8"
      />
    ),
    status: "Obter",
    disabled: false,
  },
  {
    id: "linux",
    name: "Linux",
    icon: LinuxIcon,
    status: "AppImage",
    disabled: false,
  },
  {
    id: "mac",
    name: "macOS",
    icon: AppleIcon,
    status: "Em breve",
    disabled: true,
  },
  {
    id: "android",
    name: "Android",
    icon: AndroidIcon,
    status: "Em breve",
    disabled: true,
  },
];

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DownloadSection() {
  const { t } = useTranslation();
  const { urls, loading } = useGitHubRelease();
  const { trackDownload } = useDownloadTracking();
  const cleanVersion = urls.version.replace(/^v/, "");
  const date = formatDate(urls.releaseDate);

  const getHref = (id: string) => {
    if (id === "win") return urls.winExeUrl;
    if (id === "store") return WIN_STORE_URL;
    if (id === "linux") return urls.linuxUrl;
    return "#";
  };

  const handlePlatformClick = (id: string, name: string) => {
    const href = getHref(id);
    trackDownload(name, href.split("/").pop(), href.split(".").pop());

    if (id === "store") {
      setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.href = urls.winExeUrl;
        }
      }, 1500);
    }
  };

  return (
    <section
      id="download"
      className="relative overflow-hidden bg-[var(--bg-secondary)] px-4 py-16 sm:px-8 sm:py-24 text-center"
    >
      <div className="section-title mx-auto mb-12 max-w-[480px]">
        <h2 className="relative mb-3 font-flex text-4xl font-normal tracking-tight text-[var(--accent)]">
          {t("download.title")}
        </h2>
        <p className="relative text-base text-[var(--text-secondary)]">
          {t("download.subtitle")}
        </p>
      </div>

      <ScrollReveal>
        <div className="mega-download-container mx-auto max-w-[1100px]">
          <div className="mega-card flex flex-col overflow-hidden rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] shadow-[0_40px_100px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:flex-row [data-theme=light]:border-[rgba(0,0,0,0.05)] [data-theme=light]:bg-white [data-theme=light]:shadow-[0_20px_60px_rgba(0,0,0,0.05)]">
            {/* Downloads Column */}
            <div className="mega-card-downloads p-6 sm:p-8 lg:flex-[1.2] lg:border-r lg:border-[rgba(255,255,255,0.05)] lg:[data-theme=light]:border-r-[rgba(0,0,0,0.05)]">
              <h3 className="mb-6 flex items-center gap-3 text-xl font-semibold">
                <MonitorIcon className="h-5 w-5" />
                Plataformas
              </h3>

              <div className="flex flex-col gap-3">
                {PLATFORMS.map((p) => {
                  const href = getHref(p.id);
                  const isVersioned =
                    (p.id === "win" || p.id === "linux") && !p.disabled;

                  const statusText = p.disabled
                    ? p.status
                    : loading
                      ? "Carregando..."
                      : isVersioned
                        ? `Instalar v${cleanVersion}`
                        : p.status;

                  return (
                    <a
                      key={p.id}
                      href={p.disabled ? undefined : href}
                      id={`${p.id}DownloadBtn`}
                      onClick={() =>
                        !p.disabled && handlePlatformClick(p.id, p.name)
                      }
                      aria-disabled={p.disabled}
                      className={`platform-btn flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-5 py-4 text-[var(--text)] no-underline transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        p.disabled
                          ? "disabled cursor-not-allowed opacity-40"
                          : "hover:translate-x-2 hover:border-[var(--text)] hover:bg-[var(--text)] hover:text-[var(--bg)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <p.icon className="h-5 w-5" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={`text-sm font-semibold uppercase tracking-wide ${p.disabled ? "" : "text-[var(--accent)]"} platform-status`}
                        >
                          {statusText}
                        </span>
                        {isVersioned && date && (
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {date}
                          </span>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Specs Column */}
            <div className="mega-card-specs bg-[rgba(255,255,255,0.01)] p-6 sm:p-8 lg:flex-1">
              <h3 className="mb-6 flex items-center gap-3 text-xl font-semibold">
                <MonitorIcon className="h-5 w-5" />
                Requisitos
              </h3>

              <div className="space-y-6">
                <div>
                  <h4 className="mb-2 text-xs uppercase tracking-widest text-[var(--text-tertiary)]">
                    Mínimos
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">CPU</span>
                      <span>Core i5 / Ryzen 5</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">RAM</span>
                      <span>8GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">GPU</span>
                      <span>Integrada</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[rgba(255,255,255,0.05)] pt-4">
                  <h4 className="mb-2 text-xs uppercase tracking-widest text-[var(--text-tertiary)]">
                    Recomendados
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">CPU</span>
                      <span>i7 / Ryzen 7+</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">RAM</span>
                      <span>16GB+</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">GPU</span>
                      <span>RTX 2060+</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>

      <div className="mx-auto mt-12 max-w-[1100px] px-4 sm:px-0">
        <h3 className="mb-6 text-sm font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Outros Produtos
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="https://play.google.com/store/apps/details?id=com.wesleyqdev.momaisaude"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-4 no-underline transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
          >
            <img src="/saude/icon.png" alt="" className="h-10 w-10 rounded-lg" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text)]">MomAI Saúde</span>
              <span className="text-xs text-[var(--text-tertiary)]">Google Play</span>
            </div>
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.wesleyqdev.momaifinancas"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-4 no-underline transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
          >
            <img src="/financas-icon.png" alt="" className="h-10 w-10 rounded-lg" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text)]">MomAI Finanças</span>
              <span className="text-xs text-[var(--text-tertiary)]">Google Play</span>
            </div>
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.wesleydeveloperstudio.MWScan"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-4 no-underline transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
          >
            <img src="/mwscan-icon.png" alt="" className="h-10 w-10 rounded-lg" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text)]">MW Scan</span>
              <span className="text-xs text-[var(--text-tertiary)]">Google Play</span>
            </div>
          </a>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-4 opacity-50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-lg">📱</div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text)]">MomAI Mobile</span>
              <span className="text-xs text-[var(--text-tertiary)]">Em breve</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
