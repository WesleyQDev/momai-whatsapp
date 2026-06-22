const mockSpawn = vi.fn(() => ({
  on: vi.fn(),
  unref: vi.fn()
}))

const cp = require('node:child_process')
const realSpawn = cp.spawn
cp.spawn = mockSpawn

const runtime = require('../../skills/packaged/launcher/runtime')

function restoreSpawn() {
  cp.spawn = realSpawn
}

describe('launcher skill open_local_item (openItem)', () => {
  let origExistsSync

  beforeEach(() => {
    mockSpawn.mockClear()
    const fs = require('node:fs')
    origExistsSync = fs.existsSync
    fs.existsSync = () => true
  })

  afterEach(() => {
    const fs = require('node:fs')
    fs.existsSync = origExistsSync
  })

  afterAll(() => {
    restoreSpawn()
  })

  it('uses spawn with arg array, never exec with string interpolation', async () => {
    const result = await runtime.execute({
      content: '',
      toolName: 'open_local_item',
      args: { path: 'C:\\test\\file.txt' },
      momai: { log: () => {} }
    })

    expect(mockSpawn).toHaveBeenCalled()
    const callArgs = mockSpawn.mock.calls[0]
    const args = callArgs[1]
    expect(Array.isArray(args)).toBe(true)

    const command = callArgs[0]
    expect(typeof command).toBe('string')
    expect(command).not.toContain('&')
    expect(command).not.toContain(';')
    expect(command).not.toContain('|')
    expect(command).not.toContain('$')
    expect(result.instruction).toContain('aberto com sucesso')
  })

  it('passes malicious path as a literal argument (no shell injection)', async () => {
    const maliciousPath = 'C:\\test"; calc.exe; "'
    await runtime.execute({
      content: '',
      toolName: 'open_local_item',
      args: { path: maliciousPath },
      momai: { log: () => {} }
    })

    expect(mockSpawn).toHaveBeenCalled()
    const args = mockSpawn.mock.calls[0][1]
    expect(Array.isArray(args)).toBe(true)
    expect(args).toContain(maliciousPath)
  })

  it('does not call spawn when path is missing', async () => {
    const result = await runtime.execute({
      content: '',
      toolName: 'open_local_item',
      args: {},
      momai: { log: () => {} }
    })
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(result.instruction).toContain('nao fornecido')
  })

  it('does not call spawn when path does not exist on disk', async () => {
    const fs = require('node:fs')
    fs.existsSync = () => false
    const result = await runtime.execute({
      content: '',
      toolName: 'open_local_item',
      args: { path: 'C:\\nonexistent\\does-not-exist-xyz' },
      momai: { log: () => {} }
    })
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(result.instruction.toLowerCase()).toContain('nao foi possivel')
  })
})
