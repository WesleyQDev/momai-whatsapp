import { useEffect, useRef } from 'react'

export function BackgroundEffects() {
  const starsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = starsRef.current
    if (!container) return

    const starCount = 80
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
  }, [])

  return (
    <div className="bg-effects">
      <div className="bg-stars" ref={starsRef} />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      <div className="bg-glow bg-glow-3" />
    </div>
  )
}
