// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ConversationListItem, {
  type ConversationListItemProps
} from '../src/components/ConversationListItem'

const LONG_PREVIEW =
  'PLANO 1 — A GRANDE ONDA: CONHECENDO O ARTISTA HOKUSAI — CMEI | Turma: 3A | Crônicas'

function buildProps(
  overrides: Partial<ConversationListItemProps> = {}
): ConversationListItemProps {
  return {
    jid: '5511999999999@s.whatsapp.net',
    isGroup: false,
    groupName: null,
    contactLabel: '+5511999999999',
    avatarName: '+5511999999999',
    avatarSrc: null,
    preview: { direction: 'outgoing', timestamp: 1788725308, text: LONG_PREVIEW },
    stickerSrc: null,
    timeLabel: '13/09',
    hasNew: false,
    monitoring: true,
    editing: false,
    editValue: '',
    onEditValueChange: () => {},
    onStartEdit: () => {},
    onSaveEdit: () => {},
    onCancelEdit: () => {},
    onOpen: () => {},
    onOpenMenu: () => {},
    onDelete: () => {},
    onToggleMonitoring: () => {},
    ...overrides
  }
}

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

async function renderItem(overrides: Partial<ConversationListItemProps> = {}) {
  await act(async () => {
    root.render(<ConversationListItem {...buildProps(overrides)} />)
  })
  return container
}

describe('ConversationListItem', () => {
  it('keeps the message preview bounded by the actions column so long previews ellipsize before the icons', async () => {
    const view = await renderItem()
    const row = view.firstElementChild!.firstElementChild as HTMLElement
    const contentColumn = row.children[1] as HTMLElement
    const [headerRow, actionsColumn, previewRow] = Array.from(contentColumn.children) as HTMLElement[]

    expect(contentColumn.style.gridTemplateColumns).toBe('minmax(0, 1fr) auto')

    // Actions pinned to the second column: they must not share the header or
    // the preview row, otherwise the preview text runs under the icons.
    expect(actionsColumn.querySelectorAll('button').length).toBeGreaterThan(0)
    expect(headerRow.contains(actionsColumn)).toBe(false)
    expect(actionsColumn.contains(previewRow)).toBe(false)

    const previewText = previewRow.querySelector('span.truncate') as HTMLElement
    expect(previewText.textContent).toBe(LONG_PREVIEW)
  })

  it('renders the unread badge when hasNew is true', async () => {
    const view = await renderItem({ hasNew: true })
    const badge = view.querySelector('span.uppercase')
    expect(badge).not.toBeNull()
    expect(badge?.textContent?.trim().toLowerCase()).toBe('nova')
  })

  it('does not render the unread badge when hasNew is false', async () => {
    const view = await renderItem({ hasNew: false })
    const badge = view.querySelector('span.uppercase')
    expect(badge).toBeNull()
  })

  it('does not render rename (pencil) or delete (trash) buttons in the conversation row', async () => {
    const view = await renderItem()
    const buttons = Array.from(view.querySelectorAll('button'))
    // Should not have rename or delete buttons with title attributes
    const renameBtn = buttons.find((b) => b.getAttribute('title')?.includes('Renomear'))
    const deleteBtn = buttons.find((b) => b.getAttribute('title')?.includes('Excluir'))
    expect(renameBtn).toBeUndefined()
    expect(deleteBtn).toBeUndefined()
  })

  it('renders the monitored bell icon in black', async () => {
    const view = await renderItem({ monitoring: true })
    const monitoredSvg = view.querySelector('svg.text-black')
    expect(monitoredSvg).not.toBeNull()
  })
})

