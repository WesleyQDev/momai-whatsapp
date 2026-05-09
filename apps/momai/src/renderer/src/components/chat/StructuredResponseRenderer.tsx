import React from 'react'
import { getRenderer } from './SkillResponseRegistry'

const StructuredResponseRenderer = ({ response = null }: { response?: any }) => {
  if (!response || !response.type || !response.data) {
    return null
  }

  const Renderer = getRenderer(response.type)

  if (!Renderer) {
    console.debug(`[StructuredResponse] No renderer found for type: ${response.type}`)
    return null
  }

  return React.createElement(Renderer, { data: response.data })
}

export default StructuredResponseRenderer
