import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

function getStarCount(): number {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isMobile = window.innerWidth < 768
  if (prefersReduced) return 20
  if (isMobile) return 40
  return 80
}

function Stars() {
  const starsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = starsRef.current
    if (!container) return

    container.innerHTML = ''

    const starCount = getStarCount()
    const fragment = document.createDocumentFragment()

    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('div')
      const is4Point = Math.random() > 0.85
      const size = Math.random() * 3 + 1
      const x = Math.random() * 100
      const y = Math.random() * 100
      const delay = Math.random() * 5
      const duration = Math.random() * 3 + 2

      star.className = is4Point ? 'star star-4pt' : 'star'
      if (!is4Point) {
        const colors = ['star-gold', 'star-pink', 'star-blue']
        star.classList.add(colors[Math.floor(Math.random() * colors.length)])
      }

      star.style.cssText = `
        left: ${x}%;
        top: ${y}%;
        width: ${size}px;
        height: ${size}px;
        animation-delay: ${delay}s;
        animation-duration: ${duration}s;
      `
      fragment.appendChild(star)
    }

    container.appendChild(fragment)

    const handleResize = () => {
      const newCount = getStarCount()
      if (container.childElementCount !== newCount) {
        container.innerHTML = ''
        const newFragment = document.createDocumentFragment()
        for (let i = 0; i < newCount; i++) {
          const star = document.createElement('div')
          const is4Point = Math.random() > 0.85
          const size = Math.random() * 3 + 1
          const x = Math.random() * 100
          const y = Math.random() * 100
          const delay = Math.random() * 5
          const duration = Math.random() * 3 + 2

          star.className = is4Point ? 'star star-4pt' : 'star'
          if (!is4Point) {
            const colors = ['star-gold', 'star-pink', 'star-blue']
            star.classList.add(colors[Math.floor(Math.random() * colors.length)])
          }

          star.style.cssText = `
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            animation-delay: ${delay}s;
            animation-duration: ${duration}s;
          `
          newFragment.appendChild(star)
        }
        container.appendChild(newFragment)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      container.innerHTML = ''
    }
  }, [])

  return <div className="bg-stars" ref={starsRef} />
}

export function BackgroundEffects() {
  const { pathname } = useLocation()
  const isBlogPage = pathname.includes('/blog')

  return (
    <div className={`bg-effects${isBlogPage ? ' bg-effects--blog' : ''}`}>
      {!isBlogPage && <Stars />}
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      <div className="bg-glow bg-glow-3" />
    </div>
  )
}