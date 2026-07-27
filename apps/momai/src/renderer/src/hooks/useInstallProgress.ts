import { useCallback, useRef, useEffect } from 'react'
import { installExtension, type InstallProgress, type InstallError } from '../services/api'
import { useInstallProgressContext } from '../stores/InstallProgressContext'

const MIN_INSTALLING_DURATION = 1500

export function useInstallProgress() {
  const { setInstall, setProgress, setError, clearInstall, state } = useInstallProgressContext()
  const erroredRef = useRef(false)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastStageRef = useRef<string | null>(null)
  const installStartRef = useRef<number>(0)

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  const handleInstall = useCallback(async (id: string, name: string, icon?: string, downloadUrl?: string) => {
    setInstall(id, name, icon)
    erroredRef.current = false
    lastStageRef.current = null
    installStartRef.current = Date.now()

    const finishWithSuccess = () => {
      const done: InstallProgress = {
        stage: 'done',
        status: 'Instalado',
        percent: 100,
        global_percent: 100,
        bytes_total: null,
        bytes_done: null,
        speed_bps: null,
        eta_seconds: null
      }
      setProgress(done)
      setTimeout(() => clearInstall(), 2000)
    }

    try {
      await installExtension(
        id,
        downloadUrl
          ? {
              downloadUrl,
              onProgress: (p) => {
                // Ensure minimum duration for "Instalando" phase
                if (lastStageRef.current === 'downloading' && p.stage !== 'downloading') {
                  const elapsed = Date.now() - installStartRef.current
                  const remaining = MIN_INSTALLING_DURATION - elapsed
                  if (remaining > 0) {
                    // Still show downloading briefly before transitioning
                    setTimeout(() => {
                      if (!erroredRef.current) setProgress(p)
                    }, remaining)
                    return
                  }
                }
                lastStageRef.current = p.stage
                setProgress(p)
              },
              onError: (e) => {
                setError(e)
                erroredRef.current = true
              }
            }
          : {
              onProgress: (p) => {
                if (lastStageRef.current === 'downloading' && p.stage !== 'downloading') {
                  const elapsed = Date.now() - installStartRef.current
                  const remaining = MIN_INSTALLING_DURATION - elapsed
                  if (remaining > 0) {
                    setTimeout(() => {
                      if (!erroredRef.current) setProgress(p)
                    }, remaining)
                    return
                  }
                }
                lastStageRef.current = p.stage
                setProgress(p)
              },
              onError: (e) => {
                setError(e)
                erroredRef.current = true
              }
            }
      )
      if (!erroredRef.current) finishWithSuccess()
    } catch (err) {
      setError({
        ok: false,
        status: 500,
        error: 'install_failed',
        message: String(err)
      })
      erroredRef.current = true
    }
  }, [setInstall, setProgress, setError, clearInstall])

  const simulateInstall = useCallback(async (id: string, name: string, icon?: string) => {
    setInstall(id, name, icon)
    erroredRef.current = false

    const steps = [
      { stage: 'downloading', pct: 5, speed: 3_500_000, done: 15_000_000, total: 45_000_000 },
      { stage: 'downloading', pct: 15, speed: 4_200_000, done: 25_000_000, total: 45_000_000 },
      { stage: 'downloading', pct: 30, speed: 3_800_000, done: 35_000_000, total: 45_000_000 },
      { stage: 'downloading', pct: 50, speed: 4_500_000, done: 42_000_000, total: 45_000_000 },
      { stage: 'downloading', pct: 75, speed: 4_100_000, done: 44_000_000, total: 45_000_000 },
      { stage: 'downloading', pct: 100, speed: 0, done: 45_000_000, total: 45_000_000 },
      { stage: 'verifying', pct: 0, speed: 0, done: 0, total: 0 },
      { stage: 'extracting', pct: 0, speed: 0, done: 0, total: 0 },
      { stage: 'starting_worker', pct: 0, speed: 0, done: 0, total: 0 },
    ]

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      await new Promise((r) => setTimeout(r, 600))
      const progress: InstallProgress = {
        stage: s.stage as InstallProgress['stage'],
        status: s.stage,
        percent: s.pct,
        global_percent: s.stage === 'downloading' ? 5 + Math.round((s.pct / 100) * 50) : 85 + Math.round((i - 5) * 3),
        bytes_total: s.total || null,
        bytes_done: s.done || null,
        speed_bps: s.speed || null,
        eta_seconds: s.speed ? Math.round((s.total - s.done) / s.speed) : null
      }
      setProgress(progress)
      if (erroredRef.current) return
    }

    const done: InstallProgress = {
      stage: 'done', status: 'Instalado', percent: 100, global_percent: 100,
      bytes_total: null, bytes_done: null, speed_bps: null, eta_seconds: null
    }
    setProgress(done)
    setTimeout(() => clearInstall(), 2000)
  }, [setInstall, setProgress, setError, clearInstall])

  return { state, handleInstall, simulateInstall, clearInstall }
}
