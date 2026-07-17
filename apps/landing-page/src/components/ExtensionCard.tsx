import React from "react";

const GRADIENTS = [
  "from-violet-600 to-purple-500",
  "from-rose-600 to-pink-500",
  "from-cyan-600 to-blue-500",
  "from-emerald-600 to-teal-500",
  "from-amber-600 to-orange-500",
  "from-fuchsia-600 to-pink-500",
  "from-indigo-600 to-violet-500",
  "from-lime-600 to-green-500",
  "from-sky-600 to-cyan-500",
  "from-red-600 to-rose-500",
];

export function getGradient(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower === "whatsapp") return "from-emerald-500 to-green-600";
  if (lower === "momai open" || lower === "lançador" || lower === "launcher")
    return "from-blue-500 to-indigo-600";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

const ICON_MAP: Record<string, React.ReactNode> = {
  RocketLaunch: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  ),
  launcher: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  ),
  CodeBracket: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
      />
    </svg>
  ),
  GlobeAlt: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  ),
  Cloud: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
      />
    </svg>
  ),
  ChatBubbleLeftRight: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
      />
    </svg>
  ),
  Sparkles: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  ),
  Wrench: (
    <svg
      className="h-8 w-8 text-white"
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
  ),
  PuzzlePiece: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.421 48.421 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z"
      />
    </svg>
  ),
  ShieldCheck: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  ),
  DocumentText: (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  ),
};

export function getIcon(
  iconName: string | undefined,
  iconUrl?: string,
): React.ReactNode {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className="h-8 w-8 brightness-0 invert"
        loading="lazy"
      />
    );
  }
  if (iconName && ICON_MAP[iconName]) {
    return ICON_MAP[iconName];
  }
  return (
    <svg
      className="h-8 w-8 text-white"
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
  );
}

interface ExtensionCardProps {
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  icon?: string;
  iconUrl?: string;
  iconBg?: string;
  stars?: number;
  repo?: string;
  onClick: () => void;
}

export function ExtensionCard({
  name,
  description,
  category,
  author,
  version,
  icon,
  iconUrl,
  iconBg,
  stars,
  repo,
  onClick,
}: ExtensionCardProps) {
  const gradClass = getGradient(name);
  const iconBgStyle = iconBg ? { background: iconBg } : undefined;
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-tertiary)]/60 p-6 text-left backdrop-blur-xl transition-all duration-300 hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 active:scale-[0.98]"
    >
      <div className="relative">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div
            className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${iconBgStyle ? "" : `bg-gradient-to-br ${gradClass}`} shadow-lg shadow-black/20`}
            style={iconBgStyle}
          >
            <div className="absolute inset-0 rounded-xl bg-white/10" />
            {getIcon(icon, iconUrl)}
          </div>
          <div className="flex items-center gap-2">
            {stars != null && stars > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                <svg
                  className="h-3 w-3 text-amber-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {stars}
              </div>
            )}
            <span className="shrink-0 rounded-full border border-[rgba(var(--accent-rgb),0.15)] bg-[rgba(var(--accent-rgb),0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] backdrop-blur-sm">
              {category}
            </span>
          </div>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-[var(--text)] transition-colors duration-300 group-hover:text-[var(--accent)]">
          {name}
        </h3>
        <p className="mb-5 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>

        <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-4">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            {repo ? (
              <img
                src={`https://avatars.githubusercontent.com/${encodeURIComponent(repo.split("/")[0])}?s=32`}
                alt="Author"
                className="h-3.5 w-3.5 rounded-full border border-[var(--border-color)] object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes("github.png")) {
                    target.src = "https://github.com/github.png?size=32";
                  }
                }}
              />
            ) : (
              <svg
                className="h-3 w-3"
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
            )}
            {author}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
            <svg
              className="h-3 w-3"
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
            v{version}
          </span>
        </div>
      </div>
    </button>
  );
}
