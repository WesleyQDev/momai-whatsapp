function isWeatherIntent(text) {
  const normalized = String(text || '').toLowerCase()
  return /\b(clima|tempo|temperatura|previs[aã]o do tempo|weather|forecast)\b/.test(normalized)
}

function extractWeatherLocation(text) {
  const source = String(text || '').trim()
  if (!source) return null

  const patterns = [
    /(?:tempo|clima|temperatura|previs[aã]o do tempo)\s+(?:em|para|de|na|no)\s+([^,?.!\n]+)/i,
    /(?:weather|forecast|temperature)\s+(?:in|for)\s+([^,?.!\n]+)/i,
    /\bem\s+([^,?.!\n]+)/i
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (!match || !match[1]) continue
    const location = String(match[1]).trim().replace(/^a\s+/i, '').replace(/^o\s+/i, '')
    if (location.length >= 2) return location
  }

  return null
}

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
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
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
  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=pt&format=json`
  const geocodeResp = await fetch(geocodeUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'MomAI-NodeCore/1.0' }
  })
  if (!geocodeResp.ok) return null
  const geocodeData = await geocodeResp.json().catch(() => null)
  const place = geocodeData?.results?.[0]
  if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) return null

  const forecastUrl = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${encodeURIComponent(String(place.latitude))}`,
    `&longitude=${encodeURIComponent(String(place.longitude))}`,
    '&daily=weathercode,temperature_2m_max,temperature_2m_min',
    '&hourly=weathercode',
    '&timezone=auto',
    '&forecast_days=7'
  ].join('')

  const forecastResp = await fetch(forecastUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'MomAI-NodeCore/1.0' }
  })
  if (!forecastResp.ok) return null
  const forecastData = await forecastResp.json().catch(() => null)
  const daily = forecastData?.daily
  const hourly = forecastData?.hourly
  const days = Array.isArray(daily?.time) ? daily.time.slice(0, 7) : []
  if (!days.length) return null

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

function buildWeatherMarkdown(locationLabel, rows) {
  const header = `### Previsao do tempo: ${locationLabel}`
  const table = [
    '| Dia | Condicao | Min | Max | Emoji |',
    '| --- | --- | ---: | ---: | :---: |',
    ...rows.map((row) => `| ${row.day} | ${row.condition} | ${row.min} | ${row.max} | ${row.emoji} |`)
  ]
  return `${header}\n\n${table.join('\n')}`
}

module.exports = {
  tools: [{ name: 'web_search', description: 'Realiza busca web e retorna fontes resumidas.' }],

  async execute({ content, context }) {
    const text = String(content || '').trim()
    const weatherIntent = isWeatherIntent(text)
    const weatherLocation = extractWeatherLocation(text) || 'sua cidade'

    if (weatherIntent) {
      const structuredForecast = await resolveWeatherForecast(weatherLocation).catch(() => null)
      if (structuredForecast?.rows?.length) {
        const markdown = buildWeatherMarkdown(structuredForecast.resolvedLocation, structuredForecast.rows)
        return {
          tool: 'web_search',
          directResponse: markdown,
          instruction: '',
          webSources: [
            {
              url: structuredForecast.sourceUrl,
              title: `Open-Meteo - ${structuredForecast.resolvedLocation}`,
              snippet: 'Previsao de 4 dias (hoje + 3)',
              retrieval_type: 'web'
            }
          ]
        }
      }

      const weatherQuery = `previsao do tempo em ${weatherLocation} para hoje e proximos 6 dias temperatura minima maxima condicoes`
      const results = await context.searchWeb(weatherQuery, 8)
      const lines = results.length
        ? results.map((r) => `- ${r.title} (${r.url})`)
        : ['- Nenhum resultado web encontrado no momento.']

      return {
        tool: 'web_search',
        instruction: [
          'Resultado da ferramenta web_search para clima/temperatura.',
          `Local alvo: ${weatherLocation}.`,
          'Com base apenas nas fontes abaixo, responda OBRIGATORIAMENTE com uma tabela Markdown de 7 dias (incluindo hoje).',
          `Comece a resposta com exatamente: "### Previsao do tempo: ${weatherLocation}"`,
          'A tabela deve ter EXATAMENTE estas 5 colunas nesta ordem: Dia | Condicao | Min | Max | Emoji',
          'A linha separadora deve ser: | --- | --- | ---: | ---: | :---: |',
          'Cada linha deve representar um dia (Hoje + 6 proximos dias). Use formato: "seg (DD/MM)" para o dia.',
          'Condicao: use termos curtos em portugues (ex: "Ceu limpo", "Parcialmente nublado", "Chuva", "Nublado").',
          'Min e Max: use formato "XX°C" (ex: "15°C", "27°C").',
          'Emoji: use UM emoji meteorologico por linha (☀️ ️ ⛅ ☁️ 🌧️ 🌦️ 🌨️ ❄️ ⛈️ ️).',
          'Se faltar algum dado, mantenha a linha do dia e use N/D na celula faltante.',
          'Nao adicione texto antes ou depois da tabela. A resposta deve conter APENAS o titulo e a tabela.',
          lines.join('\n')
        ].join('\n'),
        webSources: results.map((r) => ({
          url: r.url,
          title: r.title,
          snippet: 'Previsao do tempo (web)',
          retrieval_type: 'web'
        }))
      }
    }

    const results = await context.searchWeb(text, 4)
    const lines = results.length
      ? results.map((r) => `- ${r.title} (${r.url})`)
      : ['- Nenhum resultado web encontrado no momento.']

    return {
      tool: 'web_search',
      instruction: `Resultado da ferramenta web_search:\n${lines.join('\n')}`,
      webSources: results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: 'Resultado web',
        retrieval_type: 'web'
      }))
    }
  }
}
