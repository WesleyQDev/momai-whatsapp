// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ContextMenu, { type ContextMenuOption } from '../src/components/ContextMenu'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('ContextMenu', () => {
  it('renders menu items with icons on the left side of titles', async () => {
    let clickedId = ''
    const items: ContextMenuOption[] = [
      {
        id: 'reply',
        label: 'Responder',
        icon: <span data-testid="icon-reply">↩</span>,
        onClick: () => {
          clickedId = 'reply'
        }
      },
      {
        id: 'copy',
        label: 'Copiar',
        icon: <span data-testid="icon-copy">❐</span>,
        onClick: () => {
          clickedId = 'copy'
        }
      },
      {
        id: 'delete',
        label: 'Apagar',
        danger: true,
        icon: <span data-testid="icon-delete">🗑</span>,
        onClick: () => {
          clickedId = 'delete'
        }
      }
    ]

    await act(async () => {
      root.render(<ContextMenu x={100} y={150} items={items} onClose={() => {}} />)
    })

    const replyIcon = document.body.querySelector('[data-testid="icon-reply"]')
    expect(replyIcon).not.toBeNull()
    const copyIcon = document.body.querySelector('[data-testid="icon-copy"]')
    expect(copyIcon).not.toBeNull()
    const deleteIcon = document.body.querySelector('[data-testid="icon-delete"]')
    expect(deleteIcon).not.toBeNull()

    const buttons = document.body.querySelectorAll('button[role="menuitem"]')
    expect(buttons.length).toBe(3)
    expect(buttons[0].textContent).toContain('Responder')
    expect(buttons[1].textContent).toContain('Copiar')
    expect(buttons[2].textContent).toContain('Apagar')

    await act(async () => {
      ;(buttons[0] as HTMLButtonElement).click()
    })
    expect(clickedId).toBe('reply')
  })
})
