import React from 'react'

const extractTemp = (val) => {
  if (!val) return 'N/D'
  const match = String(val).match(/[\d]+/)
  return match ? match[0] : val.replace(/[^\d]/g, '')
}

const WeatherCard = ({ data }) => {
  const { location, current, forecast } = data

  const today = forecast?.[0]
  const rest = forecast?.slice(1) || []

  return (
    <div className="my-3 rounded-2xl border border-border/20 bg-zinc-900 dark:bg-zinc-900/90 text-white overflow-hidden shadow-xl">
      <div className="px-5 pt-4 pb-2">
        <h4 className="m-0 text-[14px] font-semibold text-white/90">
          Previsão do tempo: {location}
        </h4>
      </div>

      {today && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-4">
            <span className="text-[48px] leading-none">{current?.emoji || today.emoji}</span>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-[48px] font-light leading-none tracking-tight">
                  {extractTemp(today.max)}
                </span>
                <span className="text-[20px] text-white/50 font-light">°C</span>
              </div>
              <div className="text-[16px] text-white/80 font-medium mt-0.5">{today.condition}</div>
              <div className="flex items-center gap-3 mt-1.5 text-[12px] text-white/50">
                <span>Máx: {today.max}</span>
                <span>Mín: {today.min}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-5 border-t border-white/10" />

      {rest.length > 0 && (
        <div className="overflow-x-auto scrollbar-thin">
          <div className="flex items-stretch min-w-max">
            {rest.map((row, idx) => (
              <div
                key={`${row.day}-${idx}`}
                className="flex flex-col items-center gap-2 px-5 py-4 min-w-[80px] border-r border-white/5 last:border-r-0"
              >
                <span className="text-[12px] font-medium text-white/60 whitespace-nowrap">
                  {row.day}
                </span>
                <span className="text-[28px] leading-none">{row.emoji}</span>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[13px] font-semibold text-white/90">
                    {extractTemp(row.max)}°
                  </span>
                  <span className="text-[11px] text-white/40">{extractTemp(row.min)}°</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-white/5">
        <span className="text-[10px] text-white/30">MomAI Weather</span>
      </div>
    </div>
  )
}

export default WeatherCard
