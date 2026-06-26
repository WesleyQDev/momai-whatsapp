import React, { useState, useRef, useCallback, useEffect } from 'react'
const YouTubeCard = ({ data, isSpeaking = false }) => {
  const { query, videos } = data
  const [activeVideo, setActiveVideo] = useState(videos?.[0]?.id || null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPlayingAllowed, setIsPlayingAllowed] = useState(false)
  const [wasActivated, setWasActivated] = useState(false)
  const [iframeReady, setIframeReady] = useState(false)
  const [cardId] = useState(() => `yt-card-${Math.random().toString(36).substring(2, 9)}`)
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleToggleFullscreen = useCallback(() => {
    const el = iframeContainerRef.current
    if (!el) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      if (el.requestFullscreen) {
        el.requestFullscreen()
      } else if ((el as any).webkitRequestFullscreen) {
        ;(el as any).webkitRequestFullscreen()
      }
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const hasBeenSpeaking = useRef(isSpeaking)

  useEffect(() => {
    if (isSpeaking) {
      hasBeenSpeaking.current = true
      setIsPlayingAllowed(false)
    } else {
      if (hasBeenSpeaking.current) {
        const timer = setTimeout(() => {
          setIsPlayingAllowed(true)
        }, 2500)
        return () => clearTimeout(timer)
      }
    }
    return undefined
  }, [isSpeaking])

  useEffect(() => {
    if (isPlayingAllowed) {
      window.dispatchEvent(new CustomEvent('momai_youtube_play', { detail: { cardId } }))
    }
  }, [isPlayingAllowed, cardId])

  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && detail.cardId !== cardId) {
        setIsPlayingAllowed(false)
      }
    }
    window.addEventListener('momai_youtube_play', handleGlobalPlay)
    return () => {
      window.removeEventListener('momai_youtube_play', handleGlobalPlay)
    }
  }, [cardId])

  useEffect(() => {
    if (isPlayingAllowed && cardRef.current) {
      const container = cardRef.current.closest('[data-structured-response]') || cardRef.current
      requestAnimationFrame(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [isPlayingAllowed])

  useEffect(() => {
    if (isPlayingAllowed) {
      setWasActivated(true)
    }
  }, [isPlayingAllowed])

  useEffect(() => {
    setWasActivated(isPlayingAllowed)
    setIframeReady(false)
  }, [activeVideo])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow || !iframeReady) return

    try {
      if (isPlayingAllowed) {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo' }),
          '*'
        )
      } else {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo' }),
          '*'
        )
      }
    } catch (err) {
      console.error('Error sending message to YouTube iframe:', err)
    }
  }, [isPlayingAllowed, iframeReady])

  if (!videos || videos.length === 0) {
    return (
      <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 dark:bg-zinc-900/90 text-white p-5 shadow-xl">
        <p className="text-[14px] text-white/60">
          Nenhum video encontrado para &quot;{query}&quot;
        </p>
      </div>
    )
  }

  const featured = videos.find((v) => v.id === activeVideo) || videos[0]
  const others = videos.filter((v) => v.id !== featured.id)

  return (
    <div ref={cardRef} className="my-3 rounded-2xl border border-border/20 bg-zinc-900 dark:bg-zinc-900/90 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">YouTube: {query}</h4>
      </div>

      {/* Featured video with iframe */}
      <div className="px-5 pb-3">
        <div
          ref={iframeContainerRef}
          className="group/player relative w-full overflow-hidden rounded-xl bg-black"
          style={{
            paddingBottom: isFullscreen ? '0' : '56.25%',
            height: isFullscreen ? '100vh' : undefined
          }}
        >
          {wasActivated && (
            <iframe
              ref={iframeRef}
              onLoad={() => setIframeReady(true)}
              className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
                isPlayingAllowed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              src={`https://www.youtube.com/embed/${featured.id}?enablejsapi=1&autoplay=${isPlayingAllowed ? 1 : 0}`}
              title={featured.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          )}
          {!isPlayingAllowed && (
            <div
              className={`absolute inset-0 h-full w-full bg-black group/overlay overflow-hidden ${!isSpeaking ? 'cursor-pointer' : ''}`}
              onClick={!isSpeaking ? () => setIsPlayingAllowed(true) : undefined}
            >
              <img
                src={featured.thumbnail}
                alt={featured.title}
                className="h-full w-full object-cover opacity-60 transition-transform duration-500 group-hover/overlay:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover/overlay:bg-black/30 transition-colors duration-300">
                {isSpeaking ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span className="text-[12px] text-white/80 font-medium">Aguardando voz...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 border border-white/20 text-white shadow-lg backdrop-blur-md transition-all duration-300 transform group-hover/overlay:scale-110">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="ml-1 text-white"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-white/60 font-medium tracking-wide uppercase opacity-0 group-hover/overlay:opacity-100 transition-opacity duration-300">
                      Reproduzir
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Custom fullscreen toggle button */}
          <button
            onClick={handleToggleFullscreen}
            className="absolute bottom-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-md bg-black/70 hover:bg-black/90 text-white/80 hover:text-white opacity-0 group-hover/player:opacity-100 transition-opacity cursor-pointer"
            title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isFullscreen ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 14h6v6" />
                <path d="M20 10h-6V4" />
                <path d="M14 10l7-7" />
                <path d="M3 21l7-7" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
        </div>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-medium text-white/90 line-clamp-1">
              {featured.title}
            </span>
            <span className="mt-0.5 block text-[11px] text-white/50">
              {featured.channel}
              {featured.durationText && ` · ${featured.durationText}`}
              {featured.viewsText && ` · ${featured.viewsText}`}
            </span>
          </div>
          <button
            onClick={() => window.open(`https://www.youtube.com/watch?v=${featured.id}`, '_blank')}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:text-white transition-all"
            title="Abrir no YouTube"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6" />
              <path d="M10 14L21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
            Ampliar
          </button>
        </div>
      </div>

      {/* Other results */}
      {others.length > 0 && (
        <div className="px-5 pb-3">
          <div className="border-t border-white/10 pt-3">
            <div className="flex flex-col gap-2">
              {others.map((video) => (
                <div
                  key={video.id}
                  className="flex gap-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => {
                    setActiveVideo(video.id)
                    setIsPlayingAllowed(true)
                  }}
                >
                  <div className="relative flex-shrink-0 w-[100px] h-[56px]">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {video.durationText && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 py-0.5 text-[9px] font-medium text-white">
                        {video.durationText}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-center py-1 pr-2 min-w-0">
                    <span className="text-[12px] font-medium text-white/90 line-clamp-2 leading-tight">
                      {video.title}
                    </span>
                    <span className="mt-0.5 text-[10px] text-white/50 truncate">
                      {video.channel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">MomAI YouTube Search</span>
      </div>
    </div>
  )
}

export default YouTubeCard
