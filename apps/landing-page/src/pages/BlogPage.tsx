import { useEffect, useState } from 'react'
import { marked } from 'marked'

interface Post {
  id: string
  title: string
  date: string
  excerpt: string
  image: string
  content: string
  featured: boolean
}

function parseFrontmatter(text: string): Record<string, string> {
  const fm: Record<string, string> = {}
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3)
    if (end !== -1) {
      text
        .slice(3, end)
        .trim()
        .split('\n')
        .forEach((line) => {
          const idx = line.indexOf(':')
          if (idx !== -1) {
            let val = line.slice(idx + 1).trim()
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1)
            }
            fm[line.slice(0, idx).trim()] = val
          }
        })
    }
  }
  return fm
}

function removeFrontmatter(text: string): string {
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3)
    if (end !== -1) return text.slice(end + 3).trim()
  }
  return text
}

export function BlogPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [selected, setSelected] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('posts/posts.json?t=' + Date.now())
        if (!res.ok) throw new Error('posts.json não encontrado')
        const data = await res.json()
        const files: string[] = data.posts || []

        const loaded = await Promise.all(
          files.map(async (file) => {
            try {
              const r = await fetch(`posts/${file}?t=${Date.now()}`)
              if (!r.ok) return null
              const md = await r.text()
              const fm = parseFrontmatter(md)
              return {
                id: file.replace('.md', ''),
                title: fm.title || file.replace('.md', ''),
                date: fm.date || '',
                excerpt: fm.excerpt || '',
                image: fm.image || '',
                content: removeFrontmatter(md),
                featured: fm.featured === 'true',
              }
            } catch {
              return null
            }
          }),
        )

        setPosts(loaded.filter((p): p is Post => p !== null))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (selected) {
    return (
      <div className="mx-auto max-w-[750px] px-6 py-24">
        <button
          onClick={() => {
            setSelected(null)
            window.scrollTo(0, 0)
          }}
          className="mb-8 inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          ← Voltar para todos os posts
        </button>

        <div className="mb-8 border-b border-[var(--border-color)] pb-8">
          <div className="mb-2 text-sm text-[var(--text-tertiary)]">{selected.date}</div>
          <h1 className="font-flex text-4xl font-normal leading-[1.2] tracking-tight text-[var(--text)]">{selected.title}</h1>
        </div>

        <div
          className="post-content text-lg leading-[1.8] text-[var(--text-secondary)]"
          dangerouslySetInnerHTML={{ __html: marked.parse(selected.content) as string }}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] px-8 py-24">
        <div className="mb-16 text-center">
          <h1 className="mb-3 font-flex text-5xl font-normal tracking-tight" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Blog</h1>
          <p className="text-lg text-[var(--text-secondary)]">Fique por dentro das últimas novidades da MomAI</p>
        </div>
        <p className="py-16 text-center text-[var(--text-tertiary)]">Carregando posts...</p>
      </div>
    )
  }

  const featured = posts[0]
  const others = posts.slice(1)

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-24">
      <div className="mb-16 text-center">
        <h1 className="mb-3 font-flex text-5xl font-normal tracking-tight" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Blog</h1>
        <p className="text-lg text-[var(--text-secondary)]">Fique por dentro das últimas novidades da MomAI</p>
      </div>

      {featured && (
        <article
          onClick={() => setSelected(featured)}
          className="mb-12 flex cursor-pointer flex-row overflow-hidden rounded-[20px] border border-[var(--feature-border)] bg-[var(--bg-tertiary)] transition-all duration-400 hover:-translate-y-2 hover:border-[rgba(138,180,248,0.3)] hover:shadow-[0_25px_50px_rgba(0,0,0,0.2)] max-md:flex-col"
        >
          <div className="relative w-1/2 overflow-hidden bg-[var(--bg-secondary)] max-md:w-full max-md:aspect-video">
            {featured.image && (
              <img src={featured.image} alt={featured.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
          </div>
          <div className="flex w-1/2 flex-col justify-center p-10 max-md:w-full max-md:p-6">
            <span className="mb-3 inline-block w-fit rounded bg-[var(--gradient-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">Em Destaque</span>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{featured.date}</div>
            <h2 className="mb-3 font-flex text-3xl font-normal leading-[1.3] text-[var(--text)]">{featured.title}</h2>
            <p className="mb-4 line-clamp-4 text-base leading-relaxed text-[var(--text-secondary)]">{featured.excerpt}</p>
            <div className="text-sm font-medium text-[var(--accent)]">Ler mais →</div>
          </div>
        </article>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {others.map((post) => (
          <article
            key={post.id}
            onClick={() => setSelected(post)}
            className="group cursor-pointer overflow-hidden rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] transition-all duration-300 hover:-translate-y-2 hover:border-[rgba(138,180,248,0.3)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
          >
            <div className="relative aspect-video overflow-hidden bg-[var(--bg-secondary)]">
              {post.image && (
                <img src={post.image} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
            </div>
            <div className="flex flex-col p-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{post.date}</div>
              <h3 className="mb-2 text-lg font-medium leading-[1.4] text-[var(--text)]">{post.title}</h3>
              <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{post.excerpt}</p>
              <div className="text-sm font-medium text-[var(--accent)]">Ler mais →</div>
            </div>
          </article>
        ))}
      </div>

      {posts.length === 0 && (
        <p className="py-16 text-center text-[var(--text-tertiary)]">Nenhum post encontrado.</p>
      )}
    </div>
  )
}
