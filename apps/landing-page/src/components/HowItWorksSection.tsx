import { ScrollReveal } from './ScrollReveal'

const STEPS = [
  {
    number: '1',
    title: 'Baixe e instale',
    description: 'Faça o download, execute o instalador e pronto. Sem configurações complexas, sem criar conta.',
  },
  {
    number: '2',
    title: 'Inicialização automática',
    description: 'Na primeira vez, a MomAI configura o modelo de IA local automaticamente. Leva poucos minutos.',
  },
  {
    number: '3',
    title: 'Comece a conversar',
    description: 'Use texto ou voz para pedir o que precisar. Crie lembretes, pesquise, organize suas notas e muito mais.',
  },
]

export function HowItWorksSection() {
  return (
    <section id="how" className="how-section relative mx-auto max-w-[1100px] px-8 py-24">
      <div className="section-title mx-auto mb-16 max-w-[480px] text-center">
        <h2 className="mb-3 font-flex text-3xl font-normal tracking-tight text-[var(--accent)]">Como funciona</h2>
        <p className="text-base text-[var(--text-secondary)]">Em três passos simples, sua assistente pessoal estará pronta.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <ScrollReveal key={i} delay={i * 0.15}>
            <div className="step relative text-center">
              <div className="step-number relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(197,138,249,0.2)] bg-[var(--bg-tertiary)] text-base font-medium text-[var(--accent)]">
                {step.number}
                <span className="absolute inset-[-4px] rounded-full border border-[rgba(197,138,249,0.15)]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              </div>
              <h3 className="mb-2 text-base font-medium text-[var(--text)]">{step.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{step.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
