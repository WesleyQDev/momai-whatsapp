declare module 'momai:sdk' {
  const sdk: any
  export default sdk
  export interface ContextMenuOption {
    id?: string
    label?: string
    shortcut?: string
    icon?: any
    onClick?: () => void
    danger?: boolean
    disabled?: boolean
    divider?: boolean
    children?: ContextMenuOption[]
  }
  export interface ContextMenuProps {
    x: number
    y: number
    items: ContextMenuOption[]
    onClose: () => void
    className?: string
    minWidth?: number
  }
  export const ContextMenu: (props: ContextMenuProps) => any
  export function useExtensionVisibility(explicitIsActive?: boolean, extensionId?: string): boolean
  export function useWarmup(onWarmup: () => Promise<void> | void, deps?: unknown[]): void
  export function useCachedState<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void]
  export function useShare(): { open: (payload: any) => Promise<any>; close: () => void; providers: any[] }
}

declare module 'momai:events' {
  export type ExtensionEvent = any
  export function useExtensionEvents(options: {
    eventType?: string
    onEvent?: (event: any) => void
  }): {
    events: any[]
    latestEvent: any | null
    clearEvents: () => void
  }
}

declare module 'momai:image-viewer' {
  export interface ImageViewerProps {
    src: string
    alt?: string
    onClose: () => void
  }
  const ImageViewer: (props: ImageViewerProps) => any
  export default ImageViewer
}

declare module 'react-dom' {
  const reactDom: any
  export default reactDom
  export const createPortal: any
}

interface Window {
  api?: any
}
