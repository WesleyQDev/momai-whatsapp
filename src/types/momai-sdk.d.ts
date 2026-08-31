declare module 'momai:sdk' {
  const sdk: any
  export default sdk
}

declare global {
  interface Window {
    api?: any
  }
}

export {}
