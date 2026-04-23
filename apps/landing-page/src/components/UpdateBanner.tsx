import { useState } from 'react'
import { ChevronRightIcon } from './Icons'
import { UpdateModal } from './UpdateModal'

export function UpdateBanner() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative z-[101] flex w-full items-center justify-center gap-2 border-b border-[rgba(197,138,249,0.2)] px-6 py-[0.6rem] text-center text-sm font-semibold tracking-wide text-[#c58af9] backdrop-blur-[10px]"
        style={{ animation: 'pulse-lilac-banner 3s ease-in-out infinite' }}
      >
        🎉 Nova atualização v0.8.0
        <ChevronRightIcon className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
      </button>
      <UpdateModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
