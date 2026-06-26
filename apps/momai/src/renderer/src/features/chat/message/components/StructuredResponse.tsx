import React from 'react'
import StructuredResponseRenderer from '../../../../components/chat/StructuredResponseRenderer'

interface StructuredResponseProps {
  response: any
  isSpeaking?: boolean
}

export const StructuredResponse: React.FC<StructuredResponseProps> = ({ response, isSpeaking = false }) => {
  if (!response) return null

  return (
    <div data-structured-response className="transition-all duration-500 animate-in fade-in py-0.5">
      <StructuredResponseRenderer response={response} isSpeaking={isSpeaking} />
    </div>
  )
}
