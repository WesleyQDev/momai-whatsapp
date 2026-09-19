import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../src/page.tsx', import.meta.url))

function readPageSource(): string {
  return readFileSync(pagePath, 'utf8')
}

function extractLightHoverOpacity(source: string): number[] {
  const blockPattern =
    /\[data-theme='light'\][\s\S]*?\.wa-conversation-item:(?:hover|focus|active)[\s\S]*?background-color:\s*rgba\(0,\s*0,\s*0,\s*([0-9.]+)\)/g
  const values: number[] = []
  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(source)) !== null) {
    values.push(Number(match[1]))
  }
  return values
}

describe('conversation hover background', () => {
  it('keeps the light-theme hover wash subtle', () => {
    const source = readPageSource()
    const values = extractLightHoverOpacity(source)

    expect(values.length).toBeGreaterThan(0)
    for (const opacity of values) {
      expect(opacity).toBeLessThanOrEqual(0.1)
    }
    expect(source).toContain('rgba(0, 0, 0, 0.06)')
  })

  it('does not restore the previous stronger gray wash', () => {
    const source = readPageSource()

    expect(source).not.toContain('rgba(0, 0, 0, 0.11)')
    expect(source).not.toContain('rgba(0, 0, 0, 0.18)')
  })
})
