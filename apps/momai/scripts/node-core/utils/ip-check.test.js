const { isPrivateIp } = require('./ip-check.js')

describe('isPrivateIp', () => {
  it('returns true for 127.0.0.1 (loopback)', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
  })

  it('returns true for 10.0.0.1 (private class A)', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
  })

  it('returns true for 172.16.0.1 (private class B)', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true)
  })

  it('returns true for 192.168.1.1 (private class C)', () => {
    expect(isPrivateIp('192.168.1.1')).toBe(true)
  })

  it('returns true for 169.254.169.254 (AWS metadata / link-local)', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
  })

  it('returns true for ::1 (IPv6 loopback)', () => {
    expect(isPrivateIp('::1')).toBe(true)
  })

  it('returns true for fc00::1 (IPv6 unique local)', () => {
    expect(isPrivateIp('fc00::1')).toBe(true)
  })

  it('returns false for 8.8.8.8 (public DNS)', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })

  it('returns false for 1.1.1.1 (public DNS)', () => {
    expect(isPrivateIp('1.1.1.1')).toBe(false)
  })

  it('returns false for public IPv6 2001:4860:4860::8888', () => {
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
  })
})
