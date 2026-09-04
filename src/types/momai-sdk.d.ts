declare module 'momai:sdk' {
  const sdk: any
  export default sdk
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

interface Window {
  api?: any
}
