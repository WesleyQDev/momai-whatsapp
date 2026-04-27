import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { loadBlogPosts } from '../lib/blog'
import type { BlogPost } from '../content/blog'

function BlogPostView({ post, onBack }: { post: BlogPost; onBack: () => void }) {
  const navigate = useNavigate()

  const handleBack = () => {
    onBack()
    navigate('/blog')
  }

  const sanitizedHtml = DOMPurify.sanitize(marked.parse(post.content) as string)

  return (
    <div className="mx-auto max-w-[750px] px-6 py-24">
      <button
        onClick={handleBack}
        className="mb-8 inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        ← Voltar para todos os posts
      </button>

      <div className="mb-8 border-b border-[var(--border-color)] pb-8">
        {post.featured && (
          <span className="mb-3 inline-block rounded bg-[var(--gradient-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">Em Destaque</span>
        )}
        <div className="mb-2 text-sm text-[var(--text-tertiary)]">{post.date}</div>
        <h1 className="font-flex text-4xl font-normal leading-[1.2] tracking-tight text-[var(--text)]">{post.title}</h1>
      </div>

      <div
        className="post-content text-lg leading-[1.8] text-[var(--text-secondary)]"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  )
}

function BlogListing({ posts, onSelect }: { posts: BlogPost[]; onSelect: (post: BlogPost) => void }) {
  const featuredPosts = posts.filter(p => p.featured)
  const regularPosts = posts.filter(p => !p.featured)
  const heroPost = featuredPosts.length > 0 ? featuredPosts[0] : null
  const remainingFeatured = featuredPosts.slice(1)

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-24">
      <div className="mb-16 text-center">
        <h1 className="mb-3 font-flex text-5xl font-normal tracking-tight" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Blog</h1>
        <p className="text-lg text-[var(--text-secondary)]">Fique por dentro das últimas novidades da MomAI</p>
      </div>

      {heroPost && (
        <article
          onClick={() => onSelect(heroPost)}
          className="mb-12 flex cursor-pointer flex-row overflow-hidden rounded-[20px] border border-[var(--feature-border)] bg-[var(--bg-tertiary)] transition-all duration-400 hover:-translate-y-2 hover:border-[rgba(138,180,248,0.3)] hover:shadow-[0_25px_50px_rgba(0,0,0,0.2)] max-md:flex-col"
        >
          <div className="relative w-1/2 overflow-hidden bg-[var(--bg-secondary)] max-md:w-full max-md:aspect-video">
            {heroPost.image && (
              <img src={heroPost.image} alt={heroPost.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
          </div>
          <div className="flex w-1/2 flex-col justify-center p-10 max-md:w-full max-md:p-6">
            <span className="mb-3 inline-block w-fit rounded bg-[var(--gradient-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">Em Destaque</span>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{heroPost.date}</div>
            <h2 className="mb-3 font-flex text-3xl font-normal leading-[1.3] text-[var(--text)]">{heroPost.title}</h2>
            <p className="mb-4 line-clamp-4 text-base leading-relaxed text-[var(--text-secondary)]">{heroPost.excerpt}</p>
            <div className="text-sm font-medium text-[var(--accent)]">Ler mais →</div>
          </div>
        </article>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {[...remainingFeatured, ...regularPosts].map((post) => (
          <article
            key={post.id}
            onClick={() => onSelect(post)}
            className="group cursor-pointer overflow-hidden rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] transition-all duration-300 hover:-translate-y-2 hover:border-[rgba(138,180,248,0.3)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
          >
            <div className="relative aspect-video overflow-hidden bg-[var(--bg-secondary)]">
              {post.image && (
                <img src={post.image} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
            </div>
            <div className="flex flex-col p-6">
              {post.featured && (
                <span className="mb-2 inline-block w-fit rounded bg-[var(--gradient-primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Destaque</span>
              )}
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

export function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    setPosts(loadBlogPosts())
  }, [])

  const selectedPost = postId ? posts.find(p => p.id === postId) : null

  if (selectedPost) {
    return <BlogPostView post={selectedPost} onBack={() => navigate('/blog')} />
  }

  return (
    <BlogListing
      posts={posts}
      onSelect={(post) => navigate(`/blog/post/${post.id}`)}
    />
  )
}
