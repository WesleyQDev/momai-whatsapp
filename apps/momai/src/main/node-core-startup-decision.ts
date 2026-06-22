export type NodeCoreHttpStatus = 'reachable' | 'stale' | 'foreign'

export type NodeCoreStartupAction =
  | 'start_fresh'
  | 'reuse'
  | 'kill_and_restart'
  | 'error_port_conflict'

export interface NodeCoreStartupInput {
  tcpReachable: boolean
  httpStatus: NodeCoreHttpStatus
  reuseEnabled?: boolean
}

export function decideNodeCoreStartup({
  tcpReachable,
  httpStatus,
  reuseEnabled = false
}: NodeCoreStartupInput): NodeCoreStartupAction {
  if (!tcpReachable) {
    return 'start_fresh'
  }
  if (httpStatus === 'reachable') {
    return reuseEnabled ? 'reuse' : 'start_fresh'
  }
  if (httpStatus === 'stale') {
    return 'kill_and_restart'
  }
  return 'error_port_conflict'
}
