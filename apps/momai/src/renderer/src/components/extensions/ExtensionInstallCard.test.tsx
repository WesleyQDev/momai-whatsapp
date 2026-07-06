import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import ExtensionInstallCard from './ExtensionInstallCard'
import type { InstallProgress, InstallError } from '../../services/api'

vi.mock('../../i18n', () => ({
  useI18n: () => {
    const t = (key: string, vars?: Record<string, string | number>) => {
      if (key === 'extensions.installing') return ''
      if (key === 'extensions.install.eta_large') return 'Isso pode levar alguns instantes'
      if (key === 'extensions.install.error.title') return 'Erro ao instalar'
      if (key === 'extensions.install.error.close') return ''
      if (key === 'extensions.install.incompatible' && vars) {
        return `Versão ${vars.version} requer MomAI ${vars.range}`
      }
      if (key === 'extensions.install.eta_seconds' && vars) {
        return `${vars.seconds}s restantes`
      }
      const stageKey = 'extensions.stages.'
      if (key.startsWith(stageKey)) return key
      return key
    }
    return { t }
  }
}))

const progressFixture = (overrides: Partial<InstallProgress> = {}): InstallProgress => ({
  stage: 'downloading',
  status: 'downloading',
  percent: 45,
  global_percent: 25,
  bytes_total: 188547,
  bytes_done: 89340,
  speed_bps: 23456,
  eta_seconds: 4,
  ...overrides
})

const errorFixture = (overrides: Partial<InstallError> = {}): InstallError => ({
  ok: false,
  status: 409,
  error: 'incompatible_version',
  required_range: '>=2.0.0',
  release_version: '0.4.0',
  ...overrides
})

describe('ExtensionInstallCard', () => {
  it('progress variant snapshot', () => {
    const { asFragment } = render(
      <ExtensionInstallCard
        progress={progressFixture()}
        extName="WhatsApp"
      />
    )
    expect(asFragment()).toMatchSnapshot()
  })

  const stages: Array<InstallProgress['stage']> = [
    'downloading',
    'verifying',
    'extracting',
    'linking_deps',
    'indexing',
    'starting_worker',
    'done'
  ]
  it.each(stages)('renders stage %s', (stage) => {
    const { asFragment } = render(
      <ExtensionInstallCard
        progress={progressFixture({ stage, status: stage })}
        extName="WhatsApp"
      />
    )
    expect(asFragment()).toMatchSnapshot()
  })

  it('shows generic eta message when eta_seconds > 30', () => {
    const { container } = render(
      <ExtensionInstallCard
        progress={progressFixture({ eta_seconds: 60, bytes_done: 1000, bytes_total: 2000, speed_bps: 100 })}
        extName="WhatsApp"
      />
    )
    expect(container.textContent).toContain('Isso pode levar alguns instantes')
  })

  it('error variant snapshot for incompatible_version', () => {
    const { asFragment, container } = render(
      <ExtensionInstallCard error={errorFixture()} extName="WhatsApp" />
    )
    expect(asFragment()).toMatchSnapshot()
    expect(container.textContent).toContain('0.4.0')
    expect(container.textContent).toContain('>=2.0.0')
  })

  it('error variant: unknown_extension branch', () => {
    const { container } = render(
      <ExtensionInstallCard
        error={errorFixture({ error: 'unknown_extension', status: 404 })}
        extName="WhatsApp"
      />
    )
    expect(container.textContent).toContain('Extensão não encontrada.')
  })

  it('error variant: default branch uses message', () => {
    const { container } = render(
      <ExtensionInstallCard
        error={errorFixture({
          error: 'unexpected_failure',
          status: 500,
          message: 'boom'
        })}
        extName="WhatsApp"
      />
    )
    expect(container.textContent).toContain('boom')
  })

  it('renders nothing when neither progress nor error provided', () => {
    const { container } = render(<ExtensionInstallCard extName="WhatsApp" />)
    expect(container.firstChild).toBeNull()
  })

  it('dismiss button calls onDismiss', () => {
    let dismissed = false
    const { getByRole } = render(
      <ExtensionInstallCard
        error={errorFixture()}
        extName="WhatsApp"
        onDismiss={() => { dismissed = true }}
      />
    )
    getByRole('button').click()
    expect(dismissed).toBe(true)
  })
})
