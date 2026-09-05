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

declare module 'react-dom' {
  const reactDom: any
  export default reactDom
  export const createPortal: any
}

interface Window {
  api?: any
}
