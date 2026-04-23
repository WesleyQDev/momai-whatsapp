import { Link } from 'react-router-dom'
import { XMarkIcon } from './Icons'

interface UpdateModalProps {
  open: boolean
  onClose: () => void
}

export function UpdateModal({ open, onClose }: UpdateModalProps) {
  if (!open) return null

  return (
    <div
      className="modal-overlay fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-8 opacity-100 backdrop-blur-lg transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-content relative flex w-[95%] max-w-[850px] max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--bg-tertiary)] shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
        <div className="modal-header flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] px-8 py-6">
          <h2 className="m-0 font-flex text-2xl font-medium text-[var(--text)]">Novidades da MomAI</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-all hover:rotate-90 hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body flex-1 overflow-y-auto p-10 scrollbar-thin">
          <img src="/onboarding.png" alt="MomAI Nova Interface" className="mb-6 block w-full rounded-xl" />

          <div className="mb-8">
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--border-color)] bg-[rgba(255,255,255,0.03)] p-6 transition-all hover:translate-x-1 hover:border-[var(--accent-glow)]">
                <strong className="mb-2 block text-lg font-semibold text-[var(--text)]">Nova interface ✨</strong>
                <p className="m-0 text-base leading-relaxed text-[var(--text-secondary)]">
                  Um visual novo, mais moderno e fácil de usar. Tudo pensado para você encontrar o que precisa num piscar de olhos!
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-color)] bg-[rgba(255,255,255,0.03)] p-6 transition-all hover:translate-x-1 hover:border-[var(--accent-glow)]">
                <strong className="mb-2 block text-lg font-semibold text-[var(--text)]">Escolha de modos (Pro, lite e ultra) ⚙️</strong>
                <p className="m-0 text-base leading-relaxed text-[var(--text-secondary)]">
                  Agora você tem o controle total! Alterne entre velocidade e economia de recursos do seu computador de forma simples e intuitiva.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/changelog"
              onClick={onClose}
              className="inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black no-underline transition-transform hover:-translate-y-0.5"
            >
              Ver todos os detalhes
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
