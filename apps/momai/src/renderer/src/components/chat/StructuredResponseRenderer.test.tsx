import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import StructuredResponseRenderer from './StructuredResponseRenderer'
import { registerRenderer } from './SkillResponseRegistry'

describe('StructuredResponseRenderer', () => {
  it('renders nothing when response is null', () => {
    const { container } = render(<StructuredResponseRenderer response={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when response is undefined', () => {
    const { container } = render(<StructuredResponseRenderer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when response has no type', () => {
    const { container } = render(<StructuredResponseRenderer response={{ data: {} }} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when response has no data', () => {
    const { container } = render(<StructuredResponseRenderer response={{ type: 'x_no_data' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for unknown type', () => {
    const { container } = render(
      <StructuredResponseRenderer response={{ type: 'zzz_unknown', data: {} }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders registered renderer for type', () => {
    const MockRenderer = () => <div>mock renderer content</div>
    registerRenderer('my_type', MockRenderer)

    render(<StructuredResponseRenderer response={{ type: 'my_type', data: {} }} />)
    expect(screen.getByText('mock renderer content')).toBeInTheDocument()
  })

  it('passes data to the renderer component', () => {
    const MockRenderer = vi.fn(() => null)
    registerRenderer('data_type', MockRenderer)

    const testData = { message: 'hello', count: 42 }
    render(<StructuredResponseRenderer response={{ type: 'data_type', data: testData }} />)

    expect((MockRenderer.mock.calls[0] as unknown as [{ data: any }])[0]).toEqual({ data: testData })
  })

  it('renders different renderers when type changes', () => {
    const RendererA = () => <div>Renderer A content</div>
    const RendererB = () => <div>Renderer B content</div>
    registerRenderer('type_a', RendererA)
    registerRenderer('type_b', RendererB)

    const { rerender } = render(
      <StructuredResponseRenderer response={{ type: 'type_a', data: {} }} />
    )
    expect(screen.getByText('Renderer A content')).toBeInTheDocument()

    rerender(<StructuredResponseRenderer response={{ type: 'type_b', data: {} }} />)
    expect(screen.getByText('Renderer B content')).toBeInTheDocument()
  })
})
