import { useState, useEffect } from 'react'

interface UseTtsPlaybackProps {
  isSpeaking?: boolean
  onStopVoice?: () => void
  onSpeak?: () => void
}

export interface TtsPlaybackState {
  hideStopButton: boolean
  handleStopVoiceClick: () => void
}

export const useTtsPlayback = ({
  isSpeaking = false,
  onStopVoice,
  onSpeak
}: UseTtsPlaybackProps): TtsPlaybackState => {
  const [hideStopButton, setHideStopButton] = useState(false)

  const handleStopVoiceClick = () => {
    if (!onStopVoice) return
    onStopVoice()
    setHideStopButton(true)
  }

  useEffect(() => {
    if (isSpeaking) {
      setHideStopButton(false)
    }
  }, [isSpeaking])

  return {
    hideStopButton,
    handleStopVoiceClick
  }
}
