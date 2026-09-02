declare module 'momai:sdk' {
  const sdk: any
  export default sdk
}

declare module 'momai:events' {
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
  import React from 'react'
  export interface ImageViewerProps {
    src: string
    alt?: string
    onClose: () => void
  }
  const ImageViewer: React.FC<ImageViewerProps>
  export default ImageViewer
}

declare global {
  interface Window {
    api?: any
  }
}

export {}
