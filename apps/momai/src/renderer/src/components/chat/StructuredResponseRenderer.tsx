import React from 'react'
import { getRenderer } from './SkillResponseRegistry'

const StructuredResponseRenderer = ({ response }) => {
  if (!response || !response.type || !response.data) {
    return null
  }

  const Renderer = getRenderer(response.type)

  if (!Renderer) {
    console.warn(`No renderer found for structured response type: ${response.type}`)
    return null
  }

  return React.createElement(Renderer, { data: response.data })
}

export default StructuredResponseRenderer
