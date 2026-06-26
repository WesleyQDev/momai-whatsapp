import React, { useState } from 'react'

const YouTubeCard = ({ data }) => {
  const { query, videos } = data
  const [activeVideo, setActiveVideo] = useState(videos?.[0]?.id || null)

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
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 dark:bg-zinc-900/90 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">YouTube: {query}</h4>
      </div>

      {/* Featured video with iframe */}
      <div className="px-5 pb-3">
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{ paddingBottom: '56.25%' }}
        >
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${featured.id}?autoplay=1`}
            title={featured.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="mt-2">
          <span className="text-[13px] font-medium text-white/90 line-clamp-1">
            {featured.title}
          </span>
          <span className="mt-0.5 block text-[11px] text-white/50">
            {featured.channel}
            {featured.durationText && ` · ${featured.durationText}`}
            {featured.viewsText && ` · ${featured.viewsText}`}
          </span>
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
                  onClick={() => setActiveVideo(video.id)}
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
