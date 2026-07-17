import { useState } from "react";

const PIX_KEY = "wesleyqueirozdeveloper@gmail.com";

export function SaudeDoarPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(PIX_KEY).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mx-auto max-w-[800px] px-8 py-24 text-center">
      <div className="mb-12">
        <div
          className="mb-4 text-5xl"
          style={{ animation: "heartbeat 1.5s ease-in-out infinite" }}
        >
          ❤️
        </div>
        <h1
          className="mb-4 font-flex text-5xl font-normal leading-[1.1] tracking-tight"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Apoie o Projeto MomAI Saúde
        </h1>
        <p className="mx-auto max-w-[600px] text-lg leading-relaxed text-[#8b949e]">
          A MomAI Saúde não é o produto de uma grande empresa, mas sim o esforço
          de uma única pessoa dedicada a criar uma alternativa de saúde 100%
          privada, gratuita e acessível para todos monitorem suas calorias,
          passos e hidratação.
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#161b22] p-10 text-left">
        <h2 className="mb-6 text-center text-xl font-medium text-[#e6edf3]">
          ❤️ Um café para o desenvolvedor?
        </h2>

        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d1117] p-4">
            <span className="text-sm text-[#8b949e]">Chave (E-mail)</span>
            <span className="flex items-center gap-3 font-medium text-[#e6edf3]">
              {PIX_KEY}
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all ${
                  copied
                    ? "bg-gradient-to-r from-green-500 to-green-600"
                    : "bg-gradient-to-r from-[#10b981] to-[#06b6d4] hover:translate-y-[-2px] hover:shadow-[0_8px_20px_rgba(16,185,129,0.4)]"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-3.5 w-3.5"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d1117] p-4">
            <span className="text-sm text-[#8b949e]">Favorecido</span>
            <span className="flex items-center gap-2 font-medium text-[#e6edf3]">
              <svg
                viewBox="0 0 263.84207 145.56737"
                className="h-4 w-auto"
                fill="#820ad1"
              >
                <path d="M 47.627598,13.88565 C 55.970918,5.12022 67.038188,0 80.040158,0 c 25.329302,0 42.122862,18.49361 45.335812,46.19831 1.04173,8.99702 1.03217,21.68146 1.02172,36.37338 -0.002,1.50662 -0.002,3.03464 -0.002,4.58175 v 55.03839 H 91.563068 v -40.70812 c 0,0 -0.071,-34.84036 -0.28386,-41.3518 -0.93482,-28.35945 -17.72383,-46.17911 -43.65497,-46.19826 -7.8236,8.26577 -12.01559,18.3721 -12.63381,33.82498 -0.085,2.15531 -0.0636,9.79491 -0.0354,19.86367 0.0146,5.2168 0.031,11.08592 0.0354,17.18204 0.0258,26.53388 0,57.39341 0,57.39341 H 0.15770145 V 79.54842 c 0,-2.14668 -0.03915,-4.31155 -0.07839,-6.48506 -0.0789999971,-4.37205 -0.158626,-8.77775 0.07839,-13.14025 C 0.55125245,52.65062 1.8093225,45.5014 5.2028685,38.85995 12.970658,23.64481 28.886888,13.84835 45.854848,13.84835 c 0.59274,0 1.18593,0.0137 1.77275,0.0364 z" />
                <path d="m 263.68433,85.64499 c 0.237,-4.36249 0.15739,-8.76866 0.0787,-13.14025 -0.0396,-2.17351 -0.0787,-4.33838 -0.0787,-6.48505 V 3.37022 h -34.83218 c 0,0 -0.026,30.85953 0,57.39309 0.004,6.09612 0.0205,11.96479 0.035,17.18159 0.0282,10.06921 0.0496,17.70881 -0.035,19.86413 -0.61821,15.45342 -4.81056,25.55948 -12.63394,33.82548 -25.93069,-0.0182 -42.71923,-17.83938 -43.65451,-46.19832 -0.2129,-6.51144 -0.30297,-22.66995 -0.30297,-41.38451 V 3.34361 l -34.80669,0.0318 v 55.03852 c 0,1.54712 -0.002,3.07468 -0.002,4.58176 -0.011,14.69191 -0.02,27.3759 1.0217,36.37338 3.20615,27.70479 19.9997,46.1983 45.329,46.1983 13.00242,0 24.06969,-5.12035 32.41301,-13.88582 0.58637,0.0227 1.17911,0.0364 1.77184,0.0364 16.96778,0 32.88429,-9.79628 40.65217,-25.01133 3.39355,-6.642 4.65135,-13.79076 5.04484,-21.06325 z" />
              </svg>
              Wesley Queiroz
            </span>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-[#8b949e]">
          Cada linha de código, cada cálculo de caloria e cada suporte oferecido
          são feitos de forma independente. Como não há assinaturas nem venda de
          dados, o projeto cresce no ritmo do apoio de quem o utiliza.
        </p>
        <p className="mb-6 text-sm leading-relaxed text-[#8b949e]">
          Toda doação, não importa o valor, é imensamente bem-vinda. Ela ajuda a
          cobrir os custos de desenvolvimento e, principalmente, motiva o
          projeto a continuar evoluindo para novas funcionalidades de bem-estar.
        </p>

        <div className="rounded-xl bg-gradient-to-r from-[rgba(16,185,129,0.1)] to-[rgba(6,182,212,0.1)] p-6 text-center">
          <p className="font-medium text-[#e6edf3]">
            Obrigado pelo seu apoio! 💚
          </p>
        </div>
      </div>

      <style>{`
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
