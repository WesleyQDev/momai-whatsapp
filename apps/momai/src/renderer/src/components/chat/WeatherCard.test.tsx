import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeatherCard from './WeatherCard'

const getByTextContent = (container, text) => {
  const el = [...container.querySelectorAll('*')].find(
    (el) => el.textContent === text,
  )
  if (!el) throw new Error(`Element with text "${text}" not found`)
  return el
}

const mockForecast = [
  { day: 'Seg', emoji: '☀️', max: '32°C', min: '20°C', condition: 'Ensolarado' },
  { day: 'Ter', emoji: '⛅', max: '28°C', min: '18°C', condition: 'Parcialmente nublado' },
  { day: 'Qua', emoji: '🌧️', max: '22°C', min: '16°C', condition: 'Chuva leve' },
  { day: 'Qui', emoji: '☁️', max: '25°C', min: '17°C', condition: 'Nublado' },
]

const baseData = {
  location: 'São Paulo',
  current: { emoji: '☀️' },
  forecast: mockForecast,
}

describe('WeatherCard', () => {
  it('renders location name', () => {
    const { container } = render(<WeatherCard data={baseData} />)
    expect(getByTextContent(container, 'Previsão do tempo: São Paulo')).toBeTruthy()
  })

  it('renders temperature from today forecast max', () => {
    render(<WeatherCard data={baseData} />)
    expect(screen.getByText('32')).toBeTruthy()
  })

  it('renders remaining forecast items (excluding today)', () => {
    render(<WeatherCard data={baseData} />)
    expect(screen.getByText('Ter')).toBeTruthy()
    expect(screen.getByText('Qua')).toBeTruthy()
    expect(screen.getByText('Qui')).toBeTruthy()
  })

  it('renders condition text for today', () => {
    render(<WeatherCard data={baseData} />)
    expect(screen.getByText('Ensolarado')).toBeTruthy()
  })

  it('handles empty data gracefully', () => {
    const emptyData = { location: '', current: {}, forecast: [] }
    expect(() => render(<WeatherCard data={emptyData} />)).not.toThrow()
  })

  it('renders "MomAI Weather" footer', () => {
    render(<WeatherCard data={baseData} />)
    expect(screen.getByText('MomAI Weather')).toBeTruthy()
  })
})
