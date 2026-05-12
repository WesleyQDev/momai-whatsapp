type Listener = (trace: any) => void

let traces: any[] = []
const listeners = new Set<Listener>()

export function pushTrace(trace: any) {
  traces = [trace, ...traces].slice(0, 50)
  listeners.forEach(l => l(trace))
}

export function getTraces() {
  return traces
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
