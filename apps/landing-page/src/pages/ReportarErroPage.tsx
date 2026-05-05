import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ReportarErroPage() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', email: '', error: '', os: 'Windows' })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Aqui poderia enviar para uma API
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-200px)] max-w-[600px] flex-col items-center justify-center px-8 py-24">
      <h1
        className="mb-2 text-center font-flex text-5xl font-normal leading-[1.1] tracking-tight"
        style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
      >
        {t('reportarErro.title')}
      </h1>
      <p className="mb-8 text-center text-lg text-[var(--text-secondary)]">
        {t('reportarErro.subtitle')}
      </p>

      <div className="mb-6 w-full rounded-lg border border-[var(--border-color)] bg-[var(--accent-glow)] px-4 py-3 text-center text-sm text-[var(--text-secondary)]">
        {t('reportarErro.exemplos')}
      </div>

      <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-lg">
        <div className="mb-6">
          <label className="mb-2 block font-medium text-[var(--text)]">Nome</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Seu nome"
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-3 text-[var(--text)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <div className="mb-6">
          <label className="mb-2 block font-medium text-[var(--text)]">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="seu@email.com"
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-3 text-[var(--text)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <div className="mb-6">
          <label className="mb-2 block font-medium text-[var(--text)]">Sistema Operacional</label>
          <select
            value={form.os}
            onChange={(e) => setForm({ ...form, os: e.target.value })}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-3 text-[var(--text)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          >
            <option>Windows</option>
            <option>Linux</option>
            <option>macOS</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="mb-2 block font-medium text-[var(--text)]">Descrição do erro</label>
          <textarea
            required
            value={form.error}
            onChange={(e) => setForm({ ...form, error: e.target.value })}
            placeholder="Descreva o que aconteceu..."
            className="w-full min-h-[150px] resize-y rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-3 text-[var(--text)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-white px-4 py-3 text-base font-medium text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_var(--accent-glow)] active:translate-y-0"
        >
          {submitted ? t('reportarErro.enviado') : t('reportarErro.enviar')}
        </button>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          {t('reportarErro.tambemNo')}{' '}
          <a href="https://github.com/WesleyQDev/MomAI-App/issues" target="_blank" rel="noreferrer" className="text-[var(--accent)] no-underline hover:underline">
            GitHub Issues
          </a>
        </p>
      </form>
    </div>
  )
}
