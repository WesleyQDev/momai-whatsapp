import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TitleBar from './TitleBar'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TitleBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<TitleBar />)
    expect(container.querySelector('.app-titlebar')).toBeInTheDocument()
  })

  it('renders minimize button', () => {
    render(<TitleBar />)
    expect(screen.getByTitle('Minimizar')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(<TitleBar />)
    expect(screen.getByTitle('Fechar')).toBeInTheDocument()
  })

  it('minimize button calls window.api.minimize', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByTitle('Minimizar'))
    expect(window.api.minimize).toHaveBeenCalledOnce()
  })

  it('close button calls window.api.close', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByTitle('Fechar'))
    expect(window.api.close).toHaveBeenCalledOnce()
  })

  it('renders maximize button and calls window.api.maximize on click', () => {
    render(<TitleBar />)
    const button = screen.getByTitle('Maximizar')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(window.api.maximize).toHaveBeenCalledOnce()
  })
})
