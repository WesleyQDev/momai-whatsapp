import React from 'react'
import StructuredResponseRenderer from '../../../../components/chat/StructuredResponseRenderer'

interface StructuredResponseProps {
  response: any
}

export const StructuredResponse: React.FC<StructuredResponseProps> = ({ response }) => {
  if (!response) return null

  return (
    <div className="transition-all duration-500 animate-in fade-in py-0.5">
      <StructuredResponseRenderer response={response} />
    </div>
  )
}
