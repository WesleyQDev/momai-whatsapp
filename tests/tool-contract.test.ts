import { describe, it, expect } from 'vitest'
import * as runtimeModule from '../runtime'
import manifest from '../manifest.json'

const runtime = ((runtimeModule as any).default || runtimeModule) as any

describe('tool contract (item 10)', () => {
  it('exposes the manifest tools as the single source of truth', () => {
    expect(runtime.tools).toEqual((manifest as any).tools)
  })

  it('keeps names, parameters and required fields aligned with the manifest', () => {
    const manifestTools = (manifest as any).tools as any[]
    for (const tool of manifestTools) {
      const runtimeTool = runtime.tools.find((candidate: any) => candidate.name === tool.name)
      expect(runtimeTool, `runtime tool ${tool.name}`).toBeTruthy()
      expect(Object.keys(runtimeTool.parameters.properties || {}).sort()).toEqual(
        Object.keys(tool.parameters.properties || {}).sort()
      )
      expect([...(runtimeTool.parameters.required || [])].sort()).toEqual(
        [...(tool.parameters.required || [])].sort()
      )
    }
  })
})
