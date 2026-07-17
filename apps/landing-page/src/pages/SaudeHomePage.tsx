import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.wesleyqdev.momaisaude&pcampaignid=web_share";

const HEALTH_TOPICS = [
  {
    id: "fisica",
    title: "Saúde Física",
    description:
      "Mantenha seu corpo em movimento e melhore sua vitalidade com hábitos saudáveis e exercícios diários.",
    image: "/saude/assets/saude_fisica.png",
    tips: [
      "Alimentação Balanceada",
      "Hidratação Constante",
      "Atividade Física",
      "Sono de Qualidade",
    ],
  },
  {
    id: "mental",
    title: "Saúde Mental",
    description:
      "Cultive clareza e foco. Descubra técnicas de atenção plena para manter sua mente equilibrada e produtiva.",
    image: "/saude/assets/saude_mental.png",
    tips: [
      "Prática de Mindfulness",
      "Pausas Criativas",
      "Definição de Limites",
      "Estímulo Cognitivo",
    ],
  },
  {
    id: "emocional",
    title: "Saúde Emocional",
    description:
      "Desenvolva resiliência e autoconhecimento para lidar com seus sentimentos de forma leve e saudável.",
    image: "/saude/assets/saude_emocional.png",
    tips: [
      "Autoconhecimento",
      "Resiliência",
      "Autocompaixão",
      "Busca por Apoio",
    ],
  },
  {
    id: "social",
    title: "Saúde Social",
    description:
      "Fortaleça seus laços e conexões. Aprenda a importância do apoio comunitário para o seu bem-estar geral.",
    image: "/saude/assets/saude_social.png",
    tips: [
      "Conexões Fortes",
      "Participação Comunitária",
      "Comunicação Assertiva",
      "Qualidade nos Encontros",
    ],
  },
] as const;

const FEATURES = [
  {
    title: "Contagem de Calorias",
    description:
      "Monitore sua alimentação de forma simples. A MomAI Saúde ajuda você a manter o equilíbrio nutricional diário.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 4 4-8" />
      </svg>
    ),
  },
  {
    title: "Passos e Atividade",
    description:
      "Acompanhe seu progresso diário automaticamente. Visualize seus passos, distância e metas batidas.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M2 12c1-3 3-5 5-5s4 3 5 3 3-3 5-3 4 2 5 5" />
        <path d="M2 17c1-3 3-5 5-5s4 3 5 3 3-3 5-3 4 2 5 5" />
      </svg>
    ),
  },
  {
    title: "Desafio da Água",
    description:
      "Mantenha-se hidratado com lembretes inteligentes. Registre seu consumo e complete seu desafio diário.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
      </svg>
    ),
  },
  {
    title: "Privacidade Total",
    description:
      "Seus dados de saúde nunca saem do dispositivo. Sem nuvem, sem rastreamento, apenas você e seu progresso.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    title: "Lembretes Inteligentes",
    description:
      "Agende horários para água, remédios ou treinos. A MomAI Saúde mantém você no ritmo certo o dia todo.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    title: "Insights de Saúde",
    description:
      "Receba dicas personalizadas baseadas no seu perfil, rodando IA de forma 100% local e segura.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Instale o App",
    description:
      "Baixe o aplicativo. Instalação rápida e interface intuitiva desde o primeiro toque.",
  },
  {
    number: "02",
    title: "Defina suas Metas",
    description:
      "Configure seus objetivos de peso, passos e hidratação. A MomAI Saúde se adapta ao seu estilo de vida.",
  },
  {
    number: "03",
    title: "Acompanhe e Evolua",
    description:
      "Registre seu dia e receba insights inteligentes para manter sua saúde sempre em dia.",
  },
] as const;

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

export function SaudeHomePage() {
  const [modalTopic, setModalTopic] = useState<
    (typeof HEALTH_TOPICS)[number] | null
  >(null);
  const heroRef = useScrollReveal();
  const tipsRef = useScrollReveal();
  const featuresRef = useScrollReveal();
  const stepsRef = useScrollReveal();

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalTopic(null);
    };
    if (modalTopic) {
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }
  }, [modalTopic]);

  return (
    <div className="relative z-10 min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[20%] h-[500px] w-[500px] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute -right-[20%] top-[30%] h-[400px] w-[400px] rounded-full bg-pink-900/20 blur-[120px]" />
        <div className="absolute bottom-[10%] left-[30%] h-[350px] w-[350px] rounded-full bg-blue-900/20 blur-[120px]" />
      </div>

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="fade-in relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pb-20 pt-24 text-center"
      >
        <div className="mb-5 inline-block rounded-full border border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.1)] px-4 py-1.5 text-sm font-medium text-[#10b981]">
          Sua Assistente de Saúde
        </div>

        <h1
          className="mb-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Vida saudável, na palma da sua mão.
        </h1>

        <p className="mb-10 max-w-2xl text-lg leading-relaxed text-[#8b949e]">
          A MomAI Saúde é uma assistente inteligente que ajuda você a monitorar
          calorias, passos e hidratação. Tudo 100% privado, no seu dispositivo.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <a
            href={GOOGLE_PLAY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black no-underline transition-transform hover:-translate-y-0.5"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 1.33a1 1 0 010 1.74l-2.302 1.33-2.532-2.2 2.532-2.2zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
            </svg>
            Google Play
          </a>
          <Link
            to="/saude/como-usar"
            className="text-sm text-[#8b949e] no-underline transition-colors hover:text-[#10b981]"
          >
            Dicas de saúde MomAI
          </Link>
        </div>
      </section>

      {/* Health Tips Cards */}
      <section
        ref={tipsRef}
        className="fade-in relative z-10 mx-auto max-w-5xl px-6 pb-24"
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HEALTH_TOPICS.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setModalTopic(topic)}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(16,185,129,0.3)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)]"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={topic.image}
                  alt={topic.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="mb-2 text-base font-semibold text-[#e6edf3]">
                  {topic.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#8b949e]">
                  {topic.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Health Tips Modal */}
      {modalTopic && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setModalTopic(null)}
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalTopic(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-[#8b949e] transition-colors hover:text-[#e6edf3]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="aspect-[16/9] overflow-hidden">
              <img
                src={modalTopic.image}
                alt={modalTopic.title}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="p-6">
              <h2
                className="mb-3 text-xl font-bold"
                style={{
                  background:
                    "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {modalTopic.title}
              </h2>
              <p className="mb-5 text-sm leading-relaxed text-[#8b949e]">
                {modalTopic.description}
              </p>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#10b981]">
                Dicas
              </h3>
              <ul className="space-y-2">
                {modalTopic.tips.map((tip) => (
                  <li
                    key={tip}
                    className="flex items-center gap-2.5 text-sm text-[#e6edf3]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(16,185,129,0.15)] text-[10px] text-[#10b981]">
                      ✓
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Features Section */}
      <section
        ref={featuresRef}
        className="fade-in relative z-10 bg-[#0d1117] px-6 py-24"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2
              className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Por que escolher a MomAI Saúde?
            </h2>
            <p className="text-base text-[#8b949e]">
              Uma assistente projetada para quem valoriza privacidade, controle
              e simplicidade.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(16,185,129,0.2)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.1)] text-[#10b981]">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-base font-semibold text-[#e6edf3]">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#8b949e]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section ref={stepsRef} className="fade-in relative z-10 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2
              className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Como funciona
            </h2>
            <p className="text-base text-[#8b949e]">
              Em três passos simples, sua jornada de bem-estar começa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number} className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] text-lg font-bold text-[#10b981]">
                  {step.number}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[#e6edf3]">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#8b949e]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        .fade-in {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
