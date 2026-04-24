function mapWeatherCode(code) {
  const value = Number(code)
  if ([0].includes(value)) return { condition: 'Ceu limpo', emoji: '☀️' }
  if ([1].includes(value)) return { condition: 'Predominio de sol', emoji: '🌤️' }
  if ([2].includes(value)) return { condition: 'Parcialmente nublado', emoji: '⛅' }
  if ([3].includes(value)) return { condition: 'Nublado', emoji: '☁️' }
  if ([45, 48].includes(value)) return { condition: 'Neblina', emoji: '🌫️' }
  if ([51, 53, 55, 56, 57].includes(value)) return { condition: 'Garoa', emoji: '🌦️' }
  if ([61, 63, 65, 66, 67].includes(value)) return { condition: 'Chuva', emoji: '🌧️' }
  if ([71, 73, 75, 77].includes(value)) return { condition: 'Neve', emoji: '🌨️' }
  if ([80, 81, 82].includes(value)) return { condition: 'Pancadas de chuva', emoji: '🌦️' }
  if ([85, 86].includes(value)) return { condition: 'Pancadas de neve', emoji: '❄️' }
  if ([95, 96, 99].includes(value)) return { condition: 'Tempestade', emoji: '⛈️' }
  return { condition: 'Variavel', emoji: '🌡️' }
}

function formatPtDate(isoDate, idx) {
  if (!isoDate) return idx === 0 ? 'Hoje' : `Dia ${idx + 1}`
  const date = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return idx === 0 ? 'Hoje' : `Dia ${idx + 1}`
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date)
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
    date
  )
  if (idx === 0) return `Hoje (${dayMonth})`
  return `${weekday.replace('.', '')} (${dayMonth})`
}

function tempValue(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 'N/D'
  return `${Math.round(num)}°C`
}

function selectHourlyCodeForDay(dayIso, hourlyTimes, hourlyCodes) {
  if (!dayIso || !Array.isArray(hourlyTimes) || !Array.isArray(hourlyCodes)) return null

  let bestIdx = -1
  let bestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < hourlyTimes.length; i += 1) {
    const t = String(hourlyTimes[i] || '')
    if (!t.startsWith(dayIso)) continue
    const hourMatch = t.match(/T(\d{2}):/)
    const hour = Number(hourMatch?.[1] || NaN)
    if (!Number.isFinite(hour)) continue
    const distanceFromNoon = Math.abs(hour - 12)
    if (distanceFromNoon < bestDistance) {
      bestDistance = distanceFromNoon
      bestIdx = i
    }
  }

  if (bestIdx < 0) return null
  const code = Number(hourlyCodes[bestIdx])
  return Number.isFinite(code) ? code : null
}

async function resolveWeatherForecast(location) {
  console.error(`[weather] Geocoding: "${location}"`)

  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=pt&format=json`

  let geocodeResp
  try {
    geocodeResp = await fetch(geocodeUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'MomAI-NodeCore/1.0' }
    })
  } catch (err) {
    console.error(`[weather] Geocoding fetch error: ${err.message}`)
    return null
  }

  if (!geocodeResp.ok) {
    console.error(`[weather] Geocoding HTTP ${geocodeResp.status}`)
    return null
  }

  const geocodeData = await geocodeResp.json().catch(() => null)
  const place = geocodeData?.results?.[0]

  if (!place) {
    console.error(`[weather] No results for "${location}"`)
    return null
  }

  console.error(
    `[weather] Found: ${place.name}, ${place.admin1 || place.country || ''} (${place.latitude}, ${place.longitude})`
  )

  if (!Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
    console.error(`[weather] Invalid coordinates`)
    return null
  }

  const forecastUrl = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${encodeURIComponent(String(place.latitude))}`,
    `&longitude=${encodeURIComponent(String(place.longitude))}`,
    '&daily=weathercode,temperature_2m_max,temperature_2m_min',
    '&hourly=weathercode',
    '&timezone=auto',
    '&forecast_days=7'
  ].join('')

  console.error(`[weather] Fetching forecast...`)

  let forecastResp
  try {
    forecastResp = await fetch(forecastUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'MomAI-NodeCore/1.0' }
    })
  } catch (err) {
    console.error(`[weather] Forecast fetch error: ${err.message}`)
    return null
  }

  if (!forecastResp.ok) {
    console.error(`[weather] Forecast HTTP ${forecastResp.status}`)
    return null
  }

  const forecastData = await forecastResp.json().catch(() => null)
  const daily = forecastData?.daily
  const hourly = forecastData?.hourly
  const days = Array.isArray(daily?.time) ? daily.time.slice(0, 7) : []

  if (!days.length) {
    console.error(`[weather] No forecast days`)
    return null
  }

  console.error(`[weather] Got ${days.length} days`)

  const rows = days.map((dayIso, idx) => {
    const hourlyCode = selectHourlyCodeForDay(dayIso, hourly?.time, hourly?.weathercode)
    const dailyCode = Number(daily?.weathercode?.[idx])
    const selectedCode = Number.isFinite(hourlyCode) ? hourlyCode : dailyCode
    const meta = mapWeatherCode(selectedCode)
    return {
      day: formatPtDate(dayIso, idx),
      condition: meta.condition,
      min: tempValue(daily?.temperature_2m_min?.[idx]),
      max: tempValue(daily?.temperature_2m_max?.[idx]),
      emoji: meta.emoji
    }
  })

  const cityName = String(place.name || location)
  const adminName = String(place.admin1 || place.country || '').trim()
  const resolvedLocation = adminName ? `${cityName}, ${adminName}` : cityName

  return {
    resolvedLocation,
    rows,
    sourceUrl: forecastUrl
  }
}

function extractLocation(text) {
  const source = String(text || '').trim()
  if (!source) return null

  const patterns = [
    /(?:tempo|clima|temperatura|previs[aã]o do tempo)\s+(?:em|para|de|na|no)\s+([^,?.!\n]+)/i,
    /(?:weather|forecast|temperature)\s+(?:in|for)\s+([^,?.!\n]+)/i,
    /\bem\s+([^,?.!\n]+)/i,
    /\bpara\s+([^,?.!\n]+)/i,
    /\bde\s+([^,?.!\n]+)/i
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match && match[1]) {
      const location = String(match[1]).trim().replace(/^a\s+/i, '').replace(/^o\s+/i, '')
      if (location.length >= 2) return location
    }
  }

  if (source.length >= 2 && source.length < 100) {
    return source
  }

  return null
}

module.exports = {
  tools: [{ name: 'get_weather', description: 'Obtem previsao do tempo para uma localidade.' }],

  async execute({ content, context }) {
    const text = String(content || '').trim()
    console.error(`[weather] === EXECUTE ===`)
    console.error(`[weather] content type: ${typeof content}`)
    console.error(`[weather] content: "${text}"`)

    const location = extractLocation(text)
    console.error(`[weather] extracted: "${location}"`)

    if (!location) {
      console.error(`[weather] No location found`)
      return {
        tool: 'get_weather',
        instruction: 'Nao foi possivel identificar a localidade.',
        webSources: []
      }
    }

    const structuredForecast = await resolveWeatherForecast(location).catch((err) => {
      console.error(`[weather] Error: ${err.message}`)
      return null
    })

    if (structuredForecast?.rows?.length) {
      console.error(`[weather] OK: ${structuredForecast.resolvedLocation}`)
      return {
        tool: 'get_weather',
        structuredResponse: {
          type: 'weather',
          data: {
            location: structuredForecast.resolvedLocation,
            current: structuredForecast.rows[0],
            forecast: structuredForecast.rows
          }
        },
        instruction: JSON.stringify(structuredForecast),
        webSources: [
          {
            url: structuredForecast.sourceUrl,
            title: `Open-Meteo - ${structuredForecast.resolvedLocation}`,
            snippet: 'Previsao de 7 dias',
            retrieval_type: 'web'
          }
        ]
      }
    }

    console.error(`[weather] FAIL: "${location}"`)
    return {
      tool: 'get_weather',
      instruction: `Nao foi possivel obter a previsao para "${location}".`,
      webSources: []
    }
  }
}
