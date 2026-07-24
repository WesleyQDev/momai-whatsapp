import React from 'react'
import StructuredResponseRenderer from '../../../../components/chat/StructuredResponseRenderer'

interface StructuredResponseProps {
  responses: any[]
  isSpeaking?: boolean
}

export const StructuredResponse: React.FC<StructuredResponseProps> = ({
  responses,
  isSpeaking = false
}) => {
  if (!responses || responses.length === 0) return null

  return (
    <>
      {responses.map((r, i) => (
        <div
          key={i}
          data-structured-response
          className="transition-all duration-500 animate-in fade-in py-0.5"
        >
          <StructuredResponseRenderer response={r} isSpeaking={isSpeaking} />
        </div>
      ))}
    </>
  )
}
