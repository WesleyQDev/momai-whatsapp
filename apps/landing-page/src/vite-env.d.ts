/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string
  export default content
}

declare module '*.md' {
  const content: string
  export default content
  export const attributes: {
    title?: string
    date?: string
    excerpt?: string
    image?: string
    featured?: string | boolean
  }
}
