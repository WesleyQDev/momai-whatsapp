import { Audio, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const full: React.CSSProperties = { width: "100%", height: "100%" };
const center: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center" };

const appBg: React.CSSProperties = {
  background:
    "radial-gradient(1200px 700px at 15% 10%, rgba(139,92,246,0.22), transparent 50%), radial-gradient(900px 600px at 85% 80%, rgba(6,182,212,0.16), transparent 55%), #07090d",
};

const InputWeatherScene: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame: localFrame, fps, config: { damping: 16, stiffness: 120 } });
  const typingProgress = interpolate(localFrame, [10, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const clickDown = interpolate(localFrame, [82, 88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const clickUp = interpolate(localFrame, [88, 95], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const click = Math.max(clickDown, clickUp);
  const sendPulse = interpolate(localFrame, [84, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const query = "previsao do tempo em Curitiba";
  const shownChars = Math.floor(query.length * typingProgress);
  const shownText = query.slice(0, shownChars);

  return (
    <div style={{ ...full, ...center, ...appBg }}>
      <div style={{ width: 680, transform: "scale(1.08)" }}>
        <div
          style={{
            borderRadius: 18,
            background: "rgba(255,255,255,0.03)",
            padding: "14px 14px 12px 14px",
            border: "1px solid rgba(255,255,255,0.05)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
          }}
        >
          <div
            style={{
              minHeight: 56,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              fontSize: 20,
              color: "rgba(228,236,248,0.95)",
              transform: `translateY(${(1 - pop) * 6}px)`,
            }}
          >
            {shownText}
            <span style={{ opacity: shownChars < query.length ? 1 : 0 }}>|</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(164,184,214,0.85)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 10h16M4 16h16" />
                <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(164,184,214,0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="9" y="4" width="6" height="12" rx="3" />
                  <path d="M6 11a1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 1 1 2 0 6 6 0 0 1-5 5.91V20h2a1 1 0 1 1 0 2H9a1 1 0 0 1 0-2h2v-3.09A6 6 0 0 1 6 11z" />
                </svg>
              </div>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: "rgba(40,140,255,0.98)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${1 - click * 0.14})`,
                  opacity: 1 - click * 0.2,
                  boxShadow: `0 0 0 ${sendPulse * 12}px rgba(40,140,255,${0.22 * (1 - sendPulse)})`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4 11.2a1 1 0 0 1 .9-1.8l16 2a1 1 0 0 1 .27 1.89l-16 7a1 1 0 0 1-1.4-1.07l.94-4.06a1 1 0 0 0-.15-.79L3.4 11.2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const WeatherCardScene: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const { fps } = useVideoConfig();
  const cardRise = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 140 } });
  const boom = interpolate(localFrame, [0, 12, 24], [0.82, 1.07, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const jitterX = interpolate(localFrame, [0, 4, 8, 12, 16, 20, 24], [0, -8, 7, -5, 3, -1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const jitterY = interpolate(localFrame, [0, 4, 8, 12, 16, 20, 24], [14, -6, 4, -3, 2, -1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ ...full, ...center }}>
      <div
        style={{
          width: 660,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(24,24,27,0.96)",
          boxShadow: "0 14px 32px rgba(0,0,0,0.4)",
          padding: 20,
          transform: `translate(${jitterX}px, ${jitterY + (1 - cardRise) * 24}px) scale(${boom})`,
          opacity: cardRise,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Previsao do tempo: Curitiba</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 48, fontWeight: 300, color: "white", lineHeight: 1 }}>22</span>
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.55)" }}>°C</span>
            </div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.82)", fontWeight: 500, marginTop: 4 }}>Parcialmente nublado</div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              <span>Max: 22°C</span>
              <span>Min: 13°C</span>
            </div>
          </div>
          <div style={{ fontSize: 52 }}>⛅</div>
        </div>
        <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex" }}>
          {[
            ["Ter", "🌦️", "20°", "14°"],
            ["Qua", "☀️", "24°", "12°"],
            ["Qui", "🌧️", "19°", "11°"],
            ["Sex", "⛅", "21°", "13°"],
          ].map((d) => (
            <div key={d[0]} style={{ minWidth: 74, padding: "12px 14px", borderRight: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{d[0]}</div>
              <div style={{ fontSize: 24, marginTop: 6 }}>{d[1]}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginTop: 5 }}>{d[2]}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{d[3]}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>MomAI Weather</div>
      </div>
    </div>
  );
};

const IntroTypingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const typingProgress = interpolate(frame, [0, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const text = "A IA local esta virando realidade.";
  const shownChars = Math.floor(text.length * typingProgress);
  const shownText = text.slice(0, shownChars);
  const reveal = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const moveUp = interpolate(frame, [70, 90], [0, -26], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  return (
    <div style={{ ...full, ...center, ...appBg, opacity: reveal }}>
      <div
        style={{
          fontSize: 74,
          fontWeight: 900,
          color: "white",
          letterSpacing: 1,
          textAlign: "center",
          padding: "0 80px",
          transform: `translateY(${moveUp}px)`,
        }}
      >
        {shownText}
        <span style={{ opacity: shownChars < text.length ? 1 : 0.2 }}>|</span>
      </div>
    </div>
  );
};

const BenchmarkRow: React.FC<{
  localFrame: number;
  delay: number;
  label: string;
  oldValue: string;
  newValue: string;
  oldWidth: number;
  newWidth: number;
}> = ({ localFrame, delay, label, oldValue, newValue, oldWidth, newWidth }) => {
  const reveal = spring({
    frame: localFrame - delay,
    fps: 30,
    config: { damping: 14, stiffness: 110 },
  });

  return (
    <div style={{ opacity: reveal, transform: `translateY(${(1 - reveal) * 18}px)` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 92px", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", fontWeight: 700 }}>v0.9</div>
        <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div
            style={{
              width: `${oldWidth * reveal}%`,
              height: "100%",
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.34))",
            }}
          />
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.62)", textAlign: "right" }}>{oldValue}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 92px", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "#7fd0ff", fontWeight: 800 }}>v1.2</div>
        <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div
            style={{
              width: `${newWidth * reveal}%`,
              height: "100%",
              borderRadius: 999,
              background: "linear-gradient(90deg, #1d8cff, #71d2ff)",
              boxShadow: "0 0 18px rgba(29,140,255,0.35)",
            }}
          />
        </div>
        <div style={{ fontSize: 14, color: "white", textAlign: "right", fontWeight: 700 }}>{newValue}</div>
      </div>
    </div>
  );
};

const BenchmarkScene: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const panelReveal = spring({
    frame: localFrame,
    fps: 30,
    config: { damping: 16, stiffness: 100 },
  });
  const badgeReveal = spring({
    frame: localFrame - 18,
    fps: 30,
    config: { damping: 16, stiffness: 100 },
  });

  return (
    <div style={{ ...full, ...center, ...appBg }}>
      <div
        style={{
          width: 840,
          padding: 28,
          borderRadius: 24,
          background: "rgba(10,14,22,0.76)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 22px 60px rgba(0,0,0,0.36)",
          transform: `translateY(${(1 - panelReveal) * 20}px) scale(${0.96 + panelReveal * 0.04})`,
          opacity: panelReveal,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
          <div>
            <div style={{ fontSize: 15, letterSpacing: 1.2, fontWeight: 800, color: "#7fd0ff", marginBottom: 10 }}>
              BENCHMARK MOMAI
            </div>
            <div style={{ fontSize: 44, fontWeight: 900, color: "white", lineHeight: 1.05 }}>
              Mais rapida. Mais util.
            </div>
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              background: "rgba(29,140,255,0.12)",
              border: "1px solid rgba(113,210,255,0.24)",
              color: "white",
              fontWeight: 800,
              fontSize: 18,
              opacity: badgeReveal,
              transform: `translateY(${(1 - badgeReveal) * 12}px)`,
            }}
          >
            Qwen3.5
          </div>
        </div>

        <div style={{ display: "grid", gap: 24 }}>
          <BenchmarkRow
            localFrame={localFrame}
            delay={6}
            label="Velocidade de resposta"
            oldValue="1.0x"
            newValue="2.0x"
            oldWidth={42}
            newWidth={84}
          />
          <BenchmarkRow
            localFrame={localFrame}
            delay={14}
            label="Entendimento do contexto"
            oldValue="Qwen3"
            newValue="Qwen3.5"
            oldWidth={58}
            newWidth={91}
          />
          <BenchmarkRow
            localFrame={localFrame}
            delay={22}
            label="Respostas estruturadas"
            oldValue="Basico"
            newValue="Cards uteis"
            oldWidth={36}
            newWidth={88}
          />
        </div>
      </div>
    </div>
  );
};

const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.exp),
  });
  return (
    <div style={{ ...full, ...center, color: "white" }}>
      <div style={{ textAlign: "center", transform: `translateY(${(1 - reveal) * 24}px)`, opacity: reveal }}>
        <div style={{ fontSize: 62, fontWeight: 900, letterSpacing: 1.5 }}>MomAI 1.2</div>
        <div style={{ marginTop: 12, fontSize: 28, color: "rgba(255,255,255,0.8)" }}>Interface mais clara, respostas mais uteis.</div>
      </div>
    </div>
  );
};

export const MomAIPromoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const introToStats = interpolate(frame, [100, 112], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const statsToInput = interpolate(frame, [208, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const inputToCard = interpolate(frame, [280, 292], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const cardToOutro = interpolate(frame, [476, 490], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  return (
    <div style={{ ...full, ...appBg, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", position: "relative", overflow: "hidden" }}>
      <Audio src={staticFile("Nuvem de Código.mp3")} volume={0.2} />

      {frame < 112 ? (
        <div style={{ ...full, opacity: 1 - introToStats }}>
          <IntroTypingScene />
        </div>
      ) : null}

      {frame >= 100 && frame < 220 ? (
        <div style={{ ...full, opacity: frame < 112 ? introToStats : 1 - statsToInput }}>
          <BenchmarkScene localFrame={frame - 100} />
        </div>
      ) : null}

      {frame >= 208 && frame < 292 ? (
        <div style={{ ...full, opacity: frame < 220 ? statsToInput : 1 - inputToCard }}>
          <InputWeatherScene localFrame={frame - 208} />
        </div>
      ) : null}

      {frame >= 280 && frame < 490 ? (
        <div style={{ ...full, opacity: frame < 292 ? inputToCard : 1 - cardToOutro }}>
          <WeatherCardScene localFrame={frame - 280} />
        </div>
      ) : null}

      {frame >= 476 ? (
        <div style={{ ...full, opacity: cardToOutro }}>
          <OutroScene />
        </div>
      ) : null}
    </div>
  );
};
