import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ChangelogVersion {
  version: string
  date: string
  title: string
  sections: { title: string; items: string[] }[]
}

function parseChangelog(md: string): ChangelogVersion[] {
  const lines = md.split('\n')
  const versions: ChangelogVersion[] = []
  let current: ChangelogVersion | null = null
  let currentSection: { title: string; items: string[] } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const versionMatch = trimmed.match(/^## ([\d.]+) - (\d{4}-\d{2}-\d{2})$/)
    if (versionMatch) {
      if (current) versions.push(current)
      current = { version: versionMatch[1], date: versionMatch[2], title: '', sections: [] }
      currentSection = null
      continue
    }

    if (!current) continue

    if (current.title === '' && !trimmed.startsWith('##') && !trimmed.startsWith('-')) {
      current.title = trimmed
      continue
    }

    const sectionMatch = trimmed.match(/^## (.+)$/)
    if (sectionMatch) {
      const title = sectionMatch[1].replace(/[✨⚙️🐛🚀🗑️💄🔧📦]/g, '').trim()
      currentSection = { title, items: [] }
      current.sections.push(currentSection)
      continue
    }

    if (trimmed.startsWith('- ') && currentSection) {
      currentSection.items.push(trimmed.slice(2).trim())
    }
  }

  if (current) versions.push(current)
  return versions
}

export function ChangelogPage() {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<ChangelogVersion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('CHANGELOG.md')
      .then((r) => r.text())
      .then((text) => {
        setVersions(parseChangelog(text))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-[900px] px-8 py-24">
      <div className="mb-20 text-center">
        <h1 className="mb-3 font-flex text-5xl font-normal tracking-tight text-[var(--text)]">{t('changelog.title')}</h1>
        <p className="text-lg text-[var(--text-secondary)]">{t('changelog.subtitle')}</p>
      </div>

      {loading ? (
        <p className="py-16 text-center text-[var(--text-tertiary)]">{t('changelog.loading')}</p>
      ) : versions.length === 0 ? (
        <p className="py-16 text-center text-[var(--text-tertiary)]">{t('changelog.empty')}</p>
      ) : (
        <div className="relative pl-8">
          {/* Timeline line */}
          <div className="absolute bottom-0 left-[9px] top-0 w-[2px] bg-[var(--border-color)]" />

          {versions.map((v) => (
            <div key={v.version} className="relative mb-16">
              {/* Marker */}
              <div className="absolute -left-[27px] top-[5px] h-[18px] w-[18px] rounded-full border-[3px] border-[var(--accent)] bg-[var(--bg)] shadow-[0_0_0_4px_var(--bg)] transition-all hover:bg-[var(--accent)] hover:shadow-[0_0_0_4px_var(--bg),0_0_15px_var(--accent-glow)]" />

              <div className="mb-2 flex items-center gap-4">
                <span className="text-base font-bold tracking-wide text-[var(--text-tertiary)]">{v.version}</span>
                <span className="text-[0.95rem] text-[var(--text-tertiary)]">{v.date}</span>
              </div>

              <h3 className="mb-6 text-2xl font-medium leading-[1.4] tracking-tight text-[var(--text)]">{v.title}</h3>

              <div className="flex flex-col gap-6">
                {v.sections.map((section) => (
                  <div
                    key={section.title}
                    className="relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[rgba(255,255,255,0.03)] p-8 transition-all duration-400 hover:border-[rgba(var(--accent-rgb),0.3)] hover:shadow-[0_15px_35px_rgba(0,0,0,0.2)] hover:bg-[rgba(255,255,255,0.05)]"
                  >
                    <div className="absolute right-0 top-0 h-[150px] w-[150px] rounded-full bg-[radial-gradient(circle,rgba(var(--accent-rgb),0.05)_0%,transparent_70%)] blur-[20px] pointer-events-none" />
                    <h4 className="relative mb-6 flex items-center gap-3 text-lg font-medium tracking-wide text-[var(--accent)]">
                      {section.title}
                    </h4>
                    <ul className="relative m-0 flex flex-col gap-2 p-0">
                      {section.items.map((item, i) => (
                        <li key={i} className="py-1 pl-7 text-base leading-relaxed text-[var(--text-secondary)]">
                          <span className="absolute left-0 mt-[0.6rem] h-[6px] w-[6px] rounded-full bg-[var(--text-tertiary)]" />
                          <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text);font-weight:600">$1</strong>') }} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
