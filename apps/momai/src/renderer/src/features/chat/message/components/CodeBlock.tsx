import React from 'react'
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline'

interface CodeBlockProps {
  children?: any
  className?: string
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ children, className }) => {
  const [copied, setCopied] = React.useState(false)
  const code = String(children?.props?.children || children || '').replace(/\n$/, '')

  const onCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-4">
      <div className="absolute right-3 top-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onCopy}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-all backdrop-blur-sm"
        >
          {copied ? (
            <CheckIcon className="w-4 h-4 text-green-400" />
          ) : (
            <ClipboardIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      <pre className={className}>{children}</pre>
    </div>
  )
}
