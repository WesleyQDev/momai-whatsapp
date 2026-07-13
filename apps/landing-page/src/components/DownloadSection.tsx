import { useTranslation } from "react-i18next";
import { WIN_STORE_URL } from "@/constants";
import { useGitHubRelease } from "@/hooks/useGitHubRelease";
import { useDownloadTracking } from "@/hooks/useDownloadTracking";
import { ScrollReveal } from "./ScrollReveal";
import { WindowsIcon, LinuxIcon, AppleIcon, AndroidIcon } from "./Icons";

const MsStoreIcon = () => (
  <img
    src="/Icone%20microsoft%20store.png"
    alt="MS Store"
    className="h-5 w-5"
  />
);

const PLATFORMS = [
  { id: "win", name: "Windows", icon: WindowsIcon, extension: ".exe" },
  { id: "store", name: "Microsoft Store", icon: MsStoreIcon, extension: "" },
  { id: "linux", name: "Linux", icon: LinuxIcon, extension: ".AppImage" },
  { id: "mac", name: "macOS", icon: AppleIcon, extension: "", disabled: true },
  {
    id: "android",
    name: "Android",
    icon: AndroidIcon,
    extension: "",
    disabled: true,
  },
];

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
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
      className="relative overflow-hidden bg-[var(--bg-secondary)] px-8 py-24 text-center"
    >
      <div className="mx-auto mb-12 max-w-[480px]">
        <h2 className="relative mb-3 font-flex text-4xl font-normal tracking-tight text-[var(--accent)]">
          {t("download.title")}
        </h2>
        <p className="relative text-base text-[var(--text-secondary)]">
          {t("download.subtitle")}
        </p>
      </div>

      <ScrollReveal>
        <div className="mx-auto max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg)]">
            <div className="p-8">
              <h3 className="mb-6 text-left text-lg font-medium text-[var(--text)]">
                {t("download.title")}
              </h3>

              <div className="flex flex-col gap-3">
                {PLATFORMS.map((p) => {
                  const href = getHref(p.id);
                  const isVersioned =
                    (p.id === "win" || p.id === "linux") && !p.disabled;

                  return (
                    <a
                      key={p.id}
                      href={p.disabled ? undefined : href}
                      id={`${p.id}DownloadBtn`}
                      onClick={() =>
                        !p.disabled && handlePlatformClick(p.id, p.name)
                      }
                      aria-disabled={p.disabled}
                      className={`flex items-center justify-between rounded-xl border border-[var(--border-color)] px-5 py-4 text-[var(--text)] no-underline transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        p.disabled
                          ? "cursor-not-allowed opacity-40"
                          : "hover:border-[var(--accent)] hover:bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <p.icon className="h-5 w-5" />
                        <span className="font-medium">{p.name}</span>
                        {isVersioned && date && (
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {date}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium ${p.disabled ? "text-[var(--text-tertiary)]" : "text-[var(--accent)]"}`}
                      >
                        {p.disabled
                          ? "Em breve"
                          : loading
                            ? "..."
                            : isVersioned
                              ? `v${cleanVersion}`
                              : p.id === "store"
                                ? "Obter"
                                : p.extension}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-8 py-6">
              <div className="grid grid-cols-2 gap-6 text-left text-sm">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Mínimos
                  </h4>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    <li>CPU: Core i5 / Ryzen 5</li>
                    <li>RAM: 8GB</li>
                    <li>GPU: Integrada</li>
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Recomendados
                  </h4>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    <li>CPU: i7 / Ryzen 7+</li>
                    <li>RAM: 16GB+</li>
                    <li>GPU: RTX 2060+</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
