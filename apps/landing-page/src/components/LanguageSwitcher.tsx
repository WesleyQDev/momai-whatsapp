import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";

const BrFlag = () => (
  <svg viewBox="0 0 36 36" className="h-4 w-4 shrink-0 rounded-sm">
    <rect width="36" height="36" fill="#009B3A" rx="2" />
    <path d="M18 6L32 18L18 30L4 18Z" fill="#FEDF00" />
    <circle cx="18" cy="18" r="6" fill="#002776" />
    <path
      d="M12.5 18.5C14 16.5 16 16 18 16.5C20 17 22 18 23.5 18.5"
      stroke="#fff"
      strokeWidth="0.8"
      fill="none"
    />
  </svg>
);

const UsFlag = () => (
  <svg viewBox="0 0 36 36" className="h-4 w-4 shrink-0 rounded-sm">
    <rect width="36" height="36" fill="#B22234" rx="2" />
    <rect y="2.77" width="36" height="2.77" fill="#fff" />
    <rect y="8.31" width="36" height="2.77" fill="#fff" />
    <rect y="13.85" width="36" height="2.77" fill="#fff" />
    <rect y="19.38" width="36" height="2.77" fill="#fff" />
    <rect y="24.92" width="36" height="2.77" fill="#fff" />
    <rect y="30.46" width="36" height="2.77" fill="#fff" />
    <rect width="14.4" height="19.38" fill="#3C3B6E" />
  </svg>
);

const EsFlag = () => (
  <svg viewBox="0 0 36 36" className="h-4 w-4 shrink-0 rounded-sm">
    <rect width="36" height="9" fill="#AA151B" rx="2" />
    <rect y="9" width="36" height="18" fill="#F1BF00" />
    <rect y="27" width="36" height="9" fill="#AA151B" rx="2" />
  </svg>
);

const FLAGS: Record<string, React.FC> = {
  "pt-BR": BrFlag,
  en: UsFlag,
  es: EsFlag,
};

const LANGUAGES = [
  { code: "pt-BR", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current =
    LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];
  const CurrentFlag = FLAGS[current.code];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <CurrentFlag />
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-1 shadow-lg">
          {LANGUAGES.map((lang) => {
            const Flag = FLAGS[lang.code];
            return (
              <button
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-tertiary)] ${
                  lang.code === i18n.language
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                <Flag />
                <span>{lang.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
