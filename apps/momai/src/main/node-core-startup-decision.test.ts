import { describe, it, expect } from 'vitest'
import { decideNodeCoreStartup } from './node-core-startup-decision'

describe('decideNodeCoreStartup', () => {
  it('returns "start_fresh" when port is not reachable', () => {
    expect(decideNodeCoreStartup({ tcpReachable: false, httpStatus: 'foreign' })).toBe(
      'start_fresh'
    )
  })

  it('returns "reuse" when port reachable, node core reachable, and reuse is enabled', () => {
    expect(
      decideNodeCoreStartup({ tcpReachable: true, httpStatus: 'reachable', reuseEnabled: true })
    ).toBe('reuse')
  })

  it('returns "start_fresh" when port reachable, node core reachable, but reuse is disabled', () => {
    expect(
      decideNodeCoreStartup({ tcpReachable: true, httpStatus: 'reachable', reuseEnabled: false })
    ).toBe('start_fresh')
  })

  it('returns "kill_and_restart" when port reachable but node core returns 401 (stale instance with old token)', () => {
    expect(decideNodeCoreStartup({ tcpReachable: true, httpStatus: 'stale' })).toBe(
      'kill_and_restart'
    )
  })

  it('returns "error_port_conflict" when port reachable but something else is using it', () => {
    expect(decideNodeCoreStartup({ tcpReachable: true, httpStatus: 'foreign' })).toBe(
      'error_port_conflict'
    )
  })
})
