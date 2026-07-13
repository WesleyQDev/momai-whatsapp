export function SaudeReportarErroPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-200px)] max-w-[600px] flex-col items-center justify-center px-8 py-24">
      <h1
        className="mb-2 text-center font-flex text-5xl font-normal"
        style={{
          background: "var(--gradient-primary, linear-gradient(135deg, #10b981 0%, #06b6d4 100%))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Reportar Erro
      </h1>
      <p className="mb-4 text-center text-[#8b949e]">Reportando o problema</p>
      <p className="mb-8 rounded-lg border border-white/10 bg-[rgba(16,185,129,0.1)] p-3 text-center text-sm text-[#8b949e]">
        Exemplos: contagem de passos incorreta, erro ao registrar calorias,
        falha no desafio da água, comportamentos inesperados do app, etc.
      </p>

      <form
        className="w-full rounded-2xl border border-white/10 bg-[#161b22] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
        action="https://formsubmit.co/wesleyqueirozdeveloper@gmail.com"
        method="POST"
      >
        <input type="hidden" name="_subject" value="Novo relatório de erro - MomAI Saúde" />
        <input type="hidden" name="_captcha" value="false" />

        <div className="mb-6">
          <label htmlFor="titulo" className="mb-2 block font-medium text-[#e6edf3]">
            Título
          </label>
          <input
            type="text"
            id="titulo"
            name="titulo"
            placeholder="Ex: Problema ao iniciar a aplicação"
            required
            className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-4 py-3 text-[#e6edf3] placeholder-[#484f58] transition-colors focus:border-[#10b981] focus:outline-none focus:ring-2 focus:ring-[rgba(16,185,129,0.3)]"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="descricao" className="mb-2 block font-medium text-[#e6edf3]">
            Descrição
          </label>
          <textarea
            id="descricao"
            name="descricao"
            placeholder="Descreva o erro detalhadamente: o que aconteceu, quando aconteceu, quais etapas você seguiu, etc."
            required
            rows={5}
            className="w-full resize-vertical rounded-lg border border-white/10 bg-[#0d1117] px-4 py-3 text-[#e6edf3] placeholder-[#484f58] transition-colors focus:border-[#10b981] focus:outline-none focus:ring-2 focus:ring-[rgba(16,185,129,0.3)]"
          />
        </div>

        <button
          type="submit"
          className="w-full cursor-pointer rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] active:translate-y-0 dark:bg-[#10b981] dark:text-white"
        >
          Enviar Relatório
        </button>

        <p className="mt-4 text-center text-sm text-[#8b949e]">
          Após enviar, você receberá uma confirmação no email fornecido.
        </p>
      </form>
    </div>
  );
}
