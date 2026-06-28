import React from 'react'
import { getRenderer } from './SkillResponseRegistry'

const StructuredResponseRenderer = ({
  response = null,
  isSpeaking = false
}: {
  response?: any
  isSpeaking?: boolean
}) => {
  if (!response || !response.type || !response.data) {
    return null
  }

  const Renderer = getRenderer(response.type)

  if (!Renderer) {
    console.debug(`[StructuredResponse] No renderer found for type: ${response.type}`)
    return null
  }

  return React.createElement(Renderer, { data: response.data, isSpeaking })
}

export default StructuredResponseRenderer
