import { describe, it, expect } from 'vitest'
import {
  registerRenderer,
  getRenderer,
  hasRenderer,
  listRendererTypes,
} from './SkillResponseRegistry'

const FakeComponent = () => null

describe('SkillResponseRegistry', () => {
  describe('registerRenderer / getRenderer', () => {
    it('registers and retrieves a renderer', () => {
      registerRenderer('test_type', FakeComponent)
      expect(getRenderer('test_type')).toBe(FakeComponent)
    })

    it('returns null for an unregistered type', () => {
      expect(getRenderer('nonexistent')).toBeNull()
    })
  })

  describe('hasRenderer', () => {
    it('returns true for a registered type', () => {
      registerRenderer('check_type', FakeComponent)
      expect(hasRenderer('check_type')).toBe(true)
    })

    it('returns false for an unregistered type', () => {
      expect(hasRenderer('not_registered')).toBe(false)
    })
  })

  describe('listRendererTypes', () => {
    it('returns all registered type keys', () => {
      registerRenderer('type_a', FakeComponent)
      registerRenderer('type_b', FakeComponent)
      const types = listRendererTypes()
      expect(types).toContain('type_a')
      expect(types).toContain('type_b')
    })
  })
})
