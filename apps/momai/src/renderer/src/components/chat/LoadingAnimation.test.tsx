import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import LoadingAnimation from './LoadingAnimation'

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'loading.welcome' ? 'Bem-vindo à MomAI' : key)
  })
}))

describe('LoadingAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders title "Bem-vindo à MomAI"', () => {
    render(<LoadingAnimation progress={45} message="Instalando dependências..." />)
    expect(screen.getByText('Bem-vindo à MomAI')).toBeInTheDocument()
  })

  it('renders progress percentage and stage message', () => {
    render(<LoadingAnimation progress={67} message="Instalando dependências..." />)
    expect(screen.getByText('Instalando dependências...')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('does not show the delay message before 2 minutes (120 seconds)', () => {
    render(<LoadingAnimation progress={30} message="Baixando modelos..." />)

    act(() => {
      vi.advanceTimersByTime(119000)
    })

    const warningText = screen.queryByText(/Está demorando mais que o normal/i)
    if (warningText) {
      expect(warningText.parentElement).toHaveClass('opacity-0')
    }
  })

  it('shows the delay message after 2 minutes (120 seconds)', () => {
    render(<LoadingAnimation progress={30} message="Baixando modelos..." />)

    act(() => {
      vi.advanceTimersByTime(120000)
    })

    const warningText = screen.getByText(/Está demorando mais que o normal/i)
    expect(warningText).toBeInTheDocument()
    expect(warningText.parentElement).toHaveClass('opacity-100')
  })

  it('shows the 4-minute warning message after 240 seconds', () => {
    render(<LoadingAnimation progress={30} message="Baixando modelos..." />)

    act(() => {
      vi.advanceTimersByTime(240000)
    })

    const warningText = screen.getByText(
      /Algo pode não ter saído bem, reinicie e tente novamente a MomAI 😅/i
    )
    expect(warningText).toBeInTheDocument()
  })

  it('triggers onComplete callback when progress reaches 100%', () => {
    const onComplete = vi.fn()
    render(<LoadingAnimation progress={100} onComplete={onComplete} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onComplete).toHaveBeenCalled()
  })
})
