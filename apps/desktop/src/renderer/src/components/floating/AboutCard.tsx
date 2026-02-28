import { useEffect, useState } from 'react'
import FloatingCard from './FloatingCard'

interface AboutCardProps {
  onClose: () => void
}

export default function AboutCard({ onClose }: AboutCardProps) {
  const [version, setVersion] = useState('...')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  return (
    <FloatingCard onClose={onClose} width="max-w-lg">
      <div className="relative max-h-[90vh] overflow-y-auto custom-scrollbar -mx-4 -my-4">
        {/* Header */}
        <div className="flex flex-col items-center p-6 text-center border-b border-border bg-sidebar/30">
          <h2 className="text-xl font-black text-text uppercase tracking-[0.2em]">MomAI</h2>
          <p className="text-xs text-accent font-bold mt-1 tracking-wider uppercase opacity-80">{version}</p>
          <div className="w-12 h-[2px] bg-accent/30 my-4 rounded-full" />
          <p className="text-sm text-text-muted">Assistente pessoal inteligente projetado para simplificar sua vida digital.</p>
          <p className="text-xs text-text-muted mt-6 uppercase tracking-widest opacity-60">Desenvolvido por</p>
          <p className="text-base font-black text-text mt-1">Wesley Developer Studios</p>
          <p className="text-[10px] text-text-muted/40 mt-6 font-medium">
            © 2025-2026 MomAI. Todos os direitos reservados.
          </p>
        </div>

        {/* Contato */}
        <div className="p-8">
          <h3 className="text-xs font-black text-text/80 mb-6 uppercase tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-4 bg-accent rounded-full" />
            Suporte e Contato
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            {/* Email */}
            <a
              href="mailto:wesleyqueirozdeveloper@gmail.com"
              className="flex flex-col items-center p-4 bg-bg/50 border border-border/10 rounded-xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-accent"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h4 className="text-xs font-black text-text uppercase tracking-tight">Email</h4>
              <p className="text-[9px] text-text-muted text-center mt-1.5 opacity-60 leading-tight">
                wesleyqueirozdeveloper@gmail.com
              </p>
            </a>

            {/* GitHub */}
            <a
              href="https://github.com/Wesley-Developer-Studios"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center p-4 bg-bg/50 border border-border/10 rounded-xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-accent"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <h4 className="text-xs font-black text-text uppercase tracking-tight">GitHub</h4>
              <p className="text-[9px] text-text-muted text-center mt-1.5 opacity-60 leading-tight">
                Wesley Developer Studios
              </p>
            </a>

            {/* YouTube */}
            <a
              href="https://www.youtube.com/@WesleyDev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center p-4 bg-bg/50 border border-border/10 rounded-xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-accent"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <h4 className="text-xs font-black text-text uppercase tracking-tight">YouTube</h4>
              <p className="text-[9px] text-text-muted text-center mt-1.5 opacity-60 leading-tight">@WesleyDev</p>
            </a>

            {/* Repositório */}
            <a
              href="https://github.com/WesleyQDev/MomAI"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center p-4 bg-bg/50 border border-border/10 rounded-xl hover:border-accent/40 hover:bg-accent/5 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-accent"
                >
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                </svg>
              </div>
              <h4 className="text-xs font-black text-text uppercase tracking-tight">Código Fonte</h4>
              <p className="text-[9px] text-text-muted text-center mt-1.5 opacity-60 leading-tight">
                github.com/WesleyQDev/MomAI
              </p>
            </a>
          </div>

          {/* Outras dúvidas */}
          <div className="bg-bg/40 border border-border/10 p-6 rounded-2xl text-center">
            <h4 className="text-xs font-black text-text uppercase tracking-widest mb-2">Encontrou um bug?</h4>
            <p className="text-[10px] text-text-muted/70 mb-5 font-medium leading-relaxed">
              Ajude-nos a melhorar. Relate problemas ou sugira novas funcionalidades abrindo uma issue no nosso repositório.
            </p>
            <a
              href="https://github.com/WesleyQDev/MomAI/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-6 py-2.5 bg-accent text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-accent/90 hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-accent/20"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Abrir Issue no GitHub
            </a>
          </div>
        </div>
      </div>
    </FloatingCard>
  )
}
