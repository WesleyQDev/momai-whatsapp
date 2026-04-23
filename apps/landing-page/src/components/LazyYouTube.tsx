import { useState, useCallback } from 'react'
import { PlayIcon } from './Icons'

interface LazyYouTubeProps {
  videoId: string
  title?: string
}

export function LazyYouTube({ videoId, title = 'Video' }: LazyYouTubeProps) {
  const [loaded, setLoaded] = useState(false)

  const handleLoad = useCallback(() => {
    setLoaded(true)
  }, [])

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`

  return (
    <div className="video-container relative overflow-hidden rounded-[20px] border border-[var(--feature-border)] bg-[var(--bg-tertiary)] shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
      <div className="relative h-0 overflow-hidden pb-[56.25%]">
        {loaded ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title={title}
            frameBorder={0}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute left-0 top-0 h-full w-full rounded-[19px]"
            loading="lazy"
          />
        ) : (
          <button
            onClick={handleLoad}
            className="group absolute left-0 top-0 h-full w-full cursor-pointer border-0 bg-transparent p-0"
            aria-label={`Reproduzir vídeo: ${title}`}
          >
            <img
              src={thumbnailUrl}
              alt={`Thumbnail do vídeo ${title}`}
              className="absolute left-0 top-0 h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
                <PlayIcon className="ml-1 h-7 w-7 text-black" />
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
