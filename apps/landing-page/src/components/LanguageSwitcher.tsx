import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";

const LANGUAGES = [
  { code: "pt-BR", label: "pt-BR", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "en", label: "en", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "es", label: "es", flag: "\u{1F1EA}\u{1F1F8}" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current =
    LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

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
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-1 shadow-lg">
          {LANGUAGES.map((lang) => (
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
              <span className="text-base leading-none">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
