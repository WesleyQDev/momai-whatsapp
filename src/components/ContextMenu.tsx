import React from 'react'
import sdk from 'momai:sdk'
import {
  ContextMenu as SdkContextMenu,
  type ContextMenuOption,
  type ContextMenuProps
} from '../../../../momai/packages/momai-sdk/src/ContextMenu'

export type { ContextMenuOption, ContextMenuProps }

export default function ContextMenu(props: ContextMenuProps): React.ReactElement | null {
  const Comp =
    (sdk as any)?.ContextMenu ||
    (typeof window !== 'undefined' && (window as any).MomAISDK?.ContextMenu) ||
    SdkContextMenu

  if (typeof Comp === 'function') {
    return React.createElement(Comp, props)
  }
  return null
}
