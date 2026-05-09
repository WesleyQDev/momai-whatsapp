import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TierChangeOverlay from './TierChangeOverlay'

describe('TierChangeOverlay', () => {
  it('renders nothing when isChanging is false', () => {
    const { container } = render(<TierChangeOverlay isChanging={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders overlay when isChanging is true', () => {
    render(<TierChangeOverlay isChanging={true} />)
    expect(screen.getByAltText('MomAI')).toBeInTheDocument()
  })

  it('shows tier name', () => {
    render(<TierChangeOverlay isChanging={true} tier="pro" />)
    expect(screen.getByText(/pro/i)).toBeInTheDocument()
  })

  it('shows default Pro when no tier provided', () => {
    render(<TierChangeOverlay isChanging={true} />)
    expect(screen.getByText(/pro/i)).toBeInTheDocument()
  })
})
