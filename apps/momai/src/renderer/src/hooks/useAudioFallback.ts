import { useEffect } from 'react'

export function useAudioFallback() {
  useEffect(() => {
    let audioCtx: AudioContext | null = null
    let nextStartTime = 0

    const resumeContext = async () => {
      if (audioCtx && audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume()
        } catch {
          // Resume may fail if context was closed
        }
      }
    }

    const handleAudioChunk = (base64Data: string) => {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
          nextStartTime = audioCtx.currentTime
        }

        resumeContext()

        // Decode base64 to Float32Array
        const binary = atob(base64Data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const samples = new Float32Array(bytes.buffer)

        // Create buffer and play
        const audioBuffer = audioCtx.createBuffer(1, samples.length, 24000)
        audioBuffer.getChannelData(0).set(samples)

        const source = audioCtx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioCtx.destination)

        // Scheduling to avoid clicks
        const startTime = Math.max(nextStartTime, audioCtx.currentTime)
        source.start(startTime)
        nextStartTime = startTime + audioBuffer.duration
      } catch (err) {
        console.error('Audio fallback player error:', err)
      }
    }

    const remove = window.momaiAPI.onPlayAudioChunk(handleAudioChunk)

    return () => {
      remove()
      if (audioCtx) {
        audioCtx.close().catch(() => {})
      }
    }
  }, [])
}
