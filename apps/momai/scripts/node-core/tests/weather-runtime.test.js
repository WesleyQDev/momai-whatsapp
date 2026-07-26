const { extractLocation } = require('../../skills/core/weather/runtime')

describe('extractLocation', () => {
  /* === DEVE EXTRAIR === */

  test('"tempo em [cidade]"', () => {
    expect(extractLocation('qual a previsao do tempo em Sao Paulo')).toBe('Sao Paulo')
  })

  test('"tempo no [cidade]"', () => {
    expect(extractLocation('como esta o tempo no Rio de Janeiro')).toBe('Rio de Janeiro')
  })

  test('"temperatura em [cidade]"', () => {
    expect(extractLocation('qual a temperatura em Curitiba')).toBe('Curitiba')
  })

  test('"previsao do tempo para [cidade]"', () => {
    expect(extractLocation('previsao do tempo para Brasilia')).toBe('Brasilia')
  })

  test('"clima em [cidade]"', () => {
    expect(extractLocation('como esta o clima em Belo Horizonte')).toBe('Belo Horizonte')
  })

  test('"previsao [cidade]" com preposicao', () => {
    expect(extractLocation('previsao para Lisboa')).toBe('Lisboa')
  })

  test('"vai chover em [cidade]"', () => {
    expect(extractLocation('vai chover em Sao Paulo')).toBe('Sao Paulo')
  })

  test('"vai chover em [cidade] hoje" com palavra entre condicao e preposicao', () => {
    expect(extractLocation('vai chover hoje em Sao Paulo')).toBe('Sao Paulo')
  })

  test('"vai chover no [cidade]"', () => {
    expect(extractLocation('vai chover no Rio de Janeiro')).toBe('Rio de Janeiro')
  })

  test('"vai chover no [cidade]"', () => {
    expect(extractLocation('vai chover no Rio de Janeiro')).toBe('Rio de Janeiro')
  })

  test('"faz calor no [cidade]"', () => {
    expect(extractLocation('faz calor no Rio de Janeiro')).toBe('Rio de Janeiro')
  })

  test('"faz frio em [cidade]"', () => {
    expect(extractLocation('faz frio em Porto Alegre')).toBe('Porto Alegre')
  })

  test('"neve em [cidade]"', () => {
    expect(extractLocation('vai nevar em Nova York')).toBe('Nova York')
  })

  test('"sol em [cidade]"', () => {
    expect(extractLocation('vai fazer sol em Florianopolis')).toBe('Florianopolis')
  })

  test('"umidade em [cidade]"', () => {
    expect(extractLocation('umidade em Manaus')).toBe('Manaus')
  })

  test('"vento em [cidade]"', () => {
    expect(extractLocation('vento em Buenos Aires')).toBe('Buenos Aires')
  })

  test('"tempestade em [cidade]"', () => {
    expect(extractLocation('tempestade em Tóquio')).toBe('Tóquio')
  })

  test('"weather in [city]" (ingles)', () => {
    expect(extractLocation('weather in London')).toBe('London')
  })

  test('"forecast for [city]" (ingles)', () => {
    expect(extractLocation('forecast for Tokyo')).toBe('Tokyo')
  })

  test('"temperature in [city]" (ingles)', () => {
    expect(extractLocation('temperature in New York')).toBe('New York')
  })

  test('source apenas com nome de cidade (maiuscula)', () => {
    expect(extractLocation('Sao Paulo')).toBe('Sao Paulo')
  })

  test('cidade composta: "Santa Catarina"', () => {
    expect(extractLocation('Santa Catarina')).toBe('Santa Catarina')
  })

  /* === NAO DEVE EXTRAIR === */

  test('query sem local retorna null', () => {
    expect(extractLocation('qual a previsao do tempo')).toBeNull()
  })

  test('"como esta o tempo" sem local', () => {
    expect(extractLocation('como esta o tempo')).toBeNull()
  })

  test('"vai chover hoje?" sem local', () => {
    expect(extractLocation('vai chover hoje')).toBeNull()
  })

  test('fala generica sem clima', () => {
    expect(extractLocation('qual o seu nome')).toBeNull()
  })

  test('"o que voce acha de..." nao extrai "de" como local', () => {
    expect(extractLocation('o que voce acha de tecnologia')).toBeNull()
  })

  test('"fale sobre" sem local', () => {
    expect(extractLocation('fale sobre inteligencia artificial')).toBeNull()
  })

  test('texto muito longo nao vira local', () => {
    const long =
      'uma frase muito longa que nao deveria ser interpretada como local de tamanho grande'
    expect(extractLocation(long)).toBeNull()
  })

  test('string vazia retorna null', () => {
    expect(extractLocation('')).toBeNull()
  })

  test('"de" isolado nao captura local', () => {
    expect(extractLocation('fale de qualquer coisa')).toBeNull()
  })

  test('"para" sem contexto climatico e sem maiuscula nao captura', () => {
    expect(extractLocation('preciso de ajuda para minha tarefa')).toBeNull()
  })

  test('"em" sem maiuscula e sem contexto climatico nao captura', () => {
    expect(extractLocation('estou em casa agora')).toBeNull()
  })

  test('"para" maiusculo sem contexto climatico nao captura (sem padrao standalone)', () => {
    expect(extractLocation('preciso de ajuda para Minha tarefa')).toBeNull()
  })

  test('"em Cidade" maiusculo sem contexto climatico captura se parecer local', () => {
    expect(extractLocation('estou em Curitiba agora')).toBeNull()
  })

  /* === CASOS ESQUINA === */

  test('query com pontuacao', () => {
    expect(extractLocation('previsao do tempo em Sao Paulo?')).toBe('Sao Paulo')
  })

  test('cidade com acento', () => {
    expect(extractLocation('tempo em São Paulo')).toBe('São Paulo')
  })

  test('"previsão" com acento', () => {
    expect(extractLocation('previsão para Fortaleza')).toBe('Fortaleza')
  })

  test('"previsao do tempo no [cidade]"', () => {
    expect(extractLocation('previsao do tempo no Recife')).toBe('Recife')
  })

  test('"vai fazer sol em [cidade]"', () => {
    expect(extractLocation('vai fazer sol em Porto Seguro')).toBe('Porto Seguro')
  })

  test('args.location simulado via extractLocation com string limpa', () => {
    expect(extractLocation('Sao Paulo')).toBe('Sao Paulo')
  })
})

describe('weather runtime execute', () => {
  const weatherRuntime = require('../../skills/core/weather/runtime')

  test('retorna instrucao focada apenas no dia de hoje', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ name: 'São Paulo', admin1: 'SP', latitude: -23.55, longitude: -46.63 }]
            })
        })
      }
      if (url.includes('api.open-meteo.com')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              current: { temperature_2m: 22, weathercode: 0 },
              daily: {
                time: ['2026-07-26', '2026-07-27'],
                weathercode: [0, 1],
                temperature_2m_max: [25, 26],
                temperature_2m_min: [15, 16]
              },
              hourly: {
                time: ['2026-07-26T12:00'],
                weathercode: [0]
              }
            })
        })
      }
      return Promise.reject(new Error('URL desconhecida'))
    })

    try {
      const result = await weatherRuntime.execute({
        content: 'qual a previsao do tempo em Sao Paulo',
        args: { location: 'Sao Paulo' }
      })

      expect(result.tool).toBe('get_weather')
      expect(result.instruction).toContain('SOMENTE para HOJE em São Paulo, SP')
      expect(result.instruction).toContain('Não fale nem mencione os próximos dias ou próximas semanas')
      expect(result.instruction).toContain('Condição atual: ☀️ Ceu limpo (22°C)')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

