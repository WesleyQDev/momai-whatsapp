import { useEffect, useRef } from "react";

const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.wesleyqdev.momaisaude&pcampaignid=web_share";

const STEPS = [
  {
    num: 1,
    img: "/saude/assets/tutorial_print04.jpeg",
    alt: "Monitoramento de Nutrição",
    badge: "Passo 1",
    title: "Controle sua Nutrição",
    desc: 'Na aba <strong>Início</strong>, você acompanha suas calorias diárias. Registre suas refeições clicando no botão "+" e veja o balanço de proteínas, lipídios, carboidratos e fibras em tempo real.',
  },
  {
    num: 2,
    img: "/saude/assets/tutorial_print03.jpeg",
    alt: "Contagem de Passos",
    badge: "Passo 2",
    title: "Monitore seus Passos",
    desc: 'Acesse a aba <strong>Passos</strong> para ver sua evolução diária. Você pode iniciar uma caminhada manual ou sincronizar seus dados diretamente com o <strong>Google Fit</strong> para maior precisão.',
  },
  {
    num: 3,
    img: "/saude/assets/tutorial_print02.jpeg",
    alt: "Configuração de Perfil",
    badge: "Passo 3",
    title: "Configure seu Perfil",
    desc: 'Acesse a aba <strong>Perfil</strong> para inserir seus dados como peso, altura e metas. Isso permite que a MomAI Saúde calcule suas necessidades calóricas e metas de passos de forma personalizada.',
  },
  {
    num: 4,
    img: "/saude/assets/tutorial_print01.jpeg",
    alt: "Configurações do App",
    badge: "Passo 4",
    title: "Personalize o App",
    desc: 'Na aba <strong>Config</strong>, você pode alternar entre os temas claro e escuro, além de configurar a <strong>Voz da MomAI</strong> e ativar a fala automática para interagir com a assistente de saúde.',
  },
];

export function SaudeComoUsarPage() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("visible");
        }),
      { threshold: 0.1 },
    );
    refs.current.forEach((el) => {
      if (el) {
        el.classList.add("fade-in");
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-24">
      <div className="mb-16 text-center">
        <h1
          className="mb-3 font-flex text-5xl font-normal leading-[1.1] tracking-tight"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Como Usar
        </h1>
        <p className="text-lg text-[#8b949e]">
          Guia visual para você dominar todas as funções da MomAI Saúde.
        </p>
      </div>

      <div className="flex flex-col gap-12">
        {STEPS.map((step, i) => (
          <div
            key={step.num}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`flex flex-col items-center gap-8 rounded-2xl border border-white/5 bg-[#161b22] p-8 md:flex-row ${
              i % 2 === 1 ? "md:flex-row-reverse" : ""
            }`}
          >
            <div className="w-full md:w-1/2">
              <img
                src={step.img}
                alt={step.alt}
                className="w-full rounded-xl object-cover"
              />
            </div>
            <div className="w-full md:w-1/2">
              <span className="mb-3 inline-block rounded-full bg-[rgba(16,185,129,0.15)] px-3 py-1 text-xs font-medium text-[#10b981]">
                {step.badge}
              </span>
              <h2 className="mb-3 text-2xl font-normal text-[#e6edf3]">
                {step.title}
              </h2>
              <p
                className="leading-relaxed text-[#8b949e]"
                dangerouslySetInnerHTML={{ __html: step.desc }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center">
        <h2 className="mb-3 text-2xl font-normal text-[#e6edf3]">
          Pronto para começar?
        </h2>
        <p className="mb-8 text-[#8b949e]">
          Sua saúde merece o melhor cuidado, com privacidade e tecnologia.
        </p>
        <a
          href={GOOGLE_PLAY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black no-underline transition-transform hover:-translate-y-0.5"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 1.33a1 1 0 010 1.74l-2.302 1.33-2.532-2.2 2.532-2.2zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
          </svg>
          Google Play
        </a>
      </div>
    </div>
  );
}
