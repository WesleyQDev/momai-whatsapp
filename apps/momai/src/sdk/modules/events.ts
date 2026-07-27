export function createEvents() {
  const handlers = new Map<string, Set<Function>>()

  return {
    subscribe<T>(type: string, handler: (data: T) => void): () => void {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return () => handlers.get(type)?.delete(handler)
    },
    unsubscribe(type: string, handler: Function): void {
      handlers.get(type)?.delete(handler)
    },
    once<T>(type: string, handler: (data: T) => void): void {
      const wrapper = (data: T) => { handler(data); this.unsubscribe(type, wrapper) }
      this.subscribe(type, wrapper)
    },
    _emit(type: string, data: any) {
      handlers.get(type)?.forEach((h) => h(data))
    }
  }
}
