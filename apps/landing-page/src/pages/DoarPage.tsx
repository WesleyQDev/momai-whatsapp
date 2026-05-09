import { useState } from "react";
import { useTranslation } from "react-i18next";

export function DoarPage() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const pixKey = "wesleyqueirozdeveloper@gmail.com";
  const pixName = "Wesley Queiroz";

  const handleCopy = () => {
    navigator.clipboard.writeText(pixKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mx-auto max-w-[800px] px-8 py-24 text-center">
      <div className="mb-12">
        <div className="heart-icon mb-4 text-4xl">❤️</div>
        <h1
          className="mb-4 font-flex text-5xl font-normal leading-[1.1] tracking-tight"
          style={{
            background: "linear-gradient(135deg, #c58af9 0%, #f981d3 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {t("doar.title")}
        </h1>
        <p className="mx-auto max-w-[600px] text-lg text-[var(--text-secondary)] leading-relaxed">
          {t("doar.subtitle")}
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] p-10 text-left">
        <h2 className="mb-6 text-2xl font-medium text-[var(--text)]">
          {t("doar.doarViaPix")}
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-secondary)] p-4 border border-[var(--border-color)]">
            <div>
              <div className="text-sm text-[var(--text-secondary)]">
                {t("doar.pixKey")}
              </div>
              <div className="font-medium text-[var(--text)]">{pixKey}</div>
            </div>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-0.5 ${
                copied
                  ? "bg-gradient-to-r from-green-500 to-green-600"
                  : "bg-gradient-to-r from-[#c58af9] to-[#9333ea]"
              }`}
              style={
                copied
                  ? undefined
                  : { boxShadow: "0 8px 20px rgba(147, 51, 234, 0.4)" }
              }
            >
              {copied ? t("doar.pixCopied") : t("doar.pixCopy")}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-secondary)] p-4 border border-[var(--border-color)]">
            <div>
              <div className="text-sm text-[var(--text-secondary)]">Nome</div>
              <div className="font-medium text-[var(--text)]">{pixName}</div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          {t("doar.qualquerValor")}
        </p>
      </div>

      <div
        className="mt-8 rounded-xl border border-[rgba(197,138,249,0.2)] p-6"
        style={{
          background:
            "linear-gradient(135deg, rgba(197,138,249,0.1) 0%, rgba(249,129,211,0.1) 100%)",
        }}
      >
        <p className="m-0 font-medium text-[var(--text)]">
          {t("doar.obrigado")}
        </p>
      </div>

      <style>{`
        .heart-icon {
          display: inline-block;
          animation: heartbeat 1.5s ease-in-out infinite;
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          15% { transform: scale(1.2); }
          30% { transform: scale(1); }
          45% { transform: scale(1.15); }
          60% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
