import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { loadBlogPosts } from '../lib/blog'
import type { BlogPost } from '../content/blog'
import { useTranslation } from 'react-i18next'

function BlogPostView({ post, onBack }: { post: BlogPost; onBack: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleBack = () => {
    onBack()
    navigate('/blog')
  }

  const sanitizedHtml = DOMPurify.sanitize(marked.parse(post.content) as string)

  return (
    <div className="blog-post-container">
      <div className="mx-auto max-w-[760px] px-6 py-16 md:py-24">
        <button
          onClick={handleBack}
          className="mb-10 inline-flex items-center gap-2 text-sm text-[var(--accent)] transition-all hover:text-[var(--accent-hover)]"
        >
          {t('blog.voltar')}
        </button>

        <div className="mb-10">
          {post.featured && (
            <span className="mb-4 inline-block rounded-full bg-[var(--gradient-primary)] px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white">{t('blog.novidade')}</span>
          )}
          <div className="mb-3 text-sm text-[var(--text-tertiary)]">{post.date}</div>
          <h1 className="mb-5 font-flex text-3xl font-normal leading-[1.3] tracking-tight text-[var(--text)] md:text-4xl">{post.title}</h1>
          {post.author && (
            <div className="flex items-center gap-3">
              <img
                src={`https://github.com/${post.author}.png`}
                alt={post.author}
                className="h-10 w-10 rounded-full border border-[var(--border-color)]"
              />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">{post.author}</div>
                <div className="text-xs text-[var(--text-tertiary)]">{t('blog.desenvolvedor')}</div>
              </div>
            </div>
          )}
        </div>

        <div
          className="post-content text-base leading-[1.8] text-[var(--text-secondary)] md:text-lg"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </div>
    </div>
  )
}

function BlogListing({ posts, onSelect }: { posts: BlogPost[]; onSelect: (post: BlogPost) => void }) {
  const { t } = useTranslation()
  const featuredPosts = posts.filter(p => p.featured)
  const regularPosts = posts.filter(p => !p.featured)
  const heroPost = featuredPosts.length > 0 ? featuredPosts[0] : null
  const remainingFeatured = featuredPosts.slice(1)

  return (
    <div className="blog-listing-container">
      <div className="mx-auto max-w-[1100px] px-8 py-24">
      <div className="mb-16 text-center">
        <h1 className="mb-3 font-flex text-5xl font-normal tracking-tight" style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{t('blog.title')}</h1>
        <p className="text-lg text-[var(--text-secondary)]">{t('blog.subtitle')}</p>
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
            <span className="mb-3 inline-block w-fit rounded bg-[var(--gradient-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">{t('blog.featured')}</span>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{heroPost.date}</div>
            <h2 className="mb-3 font-flex text-3xl font-normal leading-[1.3] text-[var(--text)]">{heroPost.title}</h2>
            <p className="mb-4 line-clamp-4 text-base leading-relaxed text-[var(--text-secondary)]">{heroPost.excerpt}</p>
              <div className="text-sm font-medium text-[var(--accent)]">{t('blog.leiaMais')}</div>
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
                <span className="mb-2 inline-block w-fit rounded bg-[var(--gradient-primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">{t('blog.featured')}</span>
              )}
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">{post.date}</div>
              <h3 className="mb-2 text-lg font-medium leading-[1.4] text-[var(--text)]">{post.title}</h3>
              <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{post.excerpt}</p>
            <div className="text-sm font-medium text-[var(--accent)]">{t('blog.leiaMais')}</div>
            </div>
          </article>
        ))}
      </div>

      {posts.length === 0 && (
        <p className="py-16 text-center text-[var(--text-tertiary)]">{t('blog.empty')}</p>
      )}
    </div>
    </div>
  )
}

export function BlogPage() {
  const { t, i18n } = useTranslation()
  const posts = loadBlogPosts(i18n.language)
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()

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
