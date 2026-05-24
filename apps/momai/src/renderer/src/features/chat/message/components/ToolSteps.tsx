import React from 'react'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { UnifiedStep } from '../utils'

interface ToolStepsProps {
  segmentSteps: UnifiedStep[]
  segmentIdx: number
  toolsBlockExpanded: Record<number, boolean>
  setToolsBlockExpanded: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  toolsActive: Record<number, boolean>
  isLastPart: boolean
  sources?: any[]
  openSources: boolean
  setOpenSources: React.Dispatch<React.SetStateAction<boolean>>
  cleanUIMetadata: (text: string) => string
}

export const ToolSteps: React.FC<ToolStepsProps> = ({
  segmentSteps,
  segmentIdx,
  toolsBlockExpanded,
  setToolsBlockExpanded,
  toolsActive,
  isLastPart,
  sources,
  openSources,
  setOpenSources,
  cleanUIMetadata
}) => {
  const memSteps = segmentSteps.filter((s) => s.isMemory)
  const tSteps = segmentSteps.filter((s) => !s.isMemory)

  return (
    <div className="flex flex-col mt-0.5 mb-0 gap-1.5">
      {/* Memory Block */}
      {memSteps.length > 0 && (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() =>
              setToolsBlockExpanded((prev) => ({
                ...prev,
                [segmentIdx]: !prev[segmentIdx]
              }))
            }
            className="flex items-center gap-2 text-[15px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors self-start mb-0.5"
          >
            <span>Analisando o sistema de notas</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`transition-transform duration-200 ${toolsBlockExpanded[segmentIdx] ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out origin-top ${toolsBlockExpanded[segmentIdx] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col ml-1 relative">
                <div className="absolute left-[7px] top-4 bottom-6 w-[2px] bg-zinc-200 dark:bg-white/10 rounded-full"></div>
                {memSteps.map((group, idx) => (
                  <div
                    key={`mem-${segmentIdx}-${idx}`}
                    className="flex items-start gap-4 mb-5 relative group z-10 animate-in fade-in duration-300"
                  >
                    <div className="mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 bg-card border border-purple-300 dark:border-purple-500/50 text-purple-500 z-10">
                      <DocumentTextIcon className="w-2.5 h-2.5" />
                    </div>
                    <div className="flex flex-col min-w-0 pt-[1px] w-full">
                      <span className="text-[13px] font-medium tracking-wide text-zinc-700 dark:text-zinc-300">
                        Memória: {group.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tools Block */}
      <div className="flex flex-col">
        {tSteps.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setToolsBlockExpanded((prev) => ({
                ...prev,
                [segmentIdx]: !prev[segmentIdx]
              }))
            }
            className="flex items-center gap-2 text-[15px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors self-start mb-0.5"
          >
            <span>
              {(() => {
                const isRunning = tSteps.some((s) => s.status === 'running')
                const count = tSteps.length
                const verb = isRunning ? 'Executando' : 'Executou'
                return `${verb} ${count} comando${count > 1 ? 's' : ''}${isRunning ? '...' : ''}`
              })()}
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`transition-transform duration-200 ${toolsBlockExpanded[segmentIdx] || tSteps.some((s) => s.status === 'running') ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out origin-top ${toolsBlockExpanded[segmentIdx] || tSteps.some((s) => s.status === 'running') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col ml-1 relative">
              <div className="absolute left-[7px] top-4 bottom-4 w-[2px] bg-zinc-200 dark:bg-white/10 rounded-full"></div>

              {tSteps.map((group, idx) => (
                <div
                  key={`step-${segmentIdx}-${idx}`}
                  className="flex items-start gap-4 mb-5 relative group z-10 animate-in fade-in duration-300"
                >
                  <div
                    className={`mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 bg-card border ${group.status === 'running' ? 'border-blue-400 text-blue-500' : 'border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-400'} z-10`}
                  >
                    {group.status === 'running' ? (
                      <svg
                        className="w-2.5 h-2.5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                      </svg>
                    ) : (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="4 17 10 11 4 5"></polyline>
                        <line x1="12" y1="19" x2="20" y2="19"></line>
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 pt-[1px] w-full">
                    <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                      {group.name}
                    </span>
                    {group.description && (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {group.description}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Sources as tags */}
              {isLastPart && sources && sources.length > 0 && (
                <div className="flex flex-col gap-2 mb-5 relative z-10 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2">
                    <div className="w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 bg-card border border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-400">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                    </div>
                    <span className="text-[13px] text-zinc-600 dark:text-zinc-400">
                      Pesquisa <span className="font-medium">Busca na web</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 ml-[22px]">
                    {sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] !text-zinc-600 dark:!text-zinc-400 hover:!text-zinc-800 dark:hover:!text-zinc-200 transition-colors no-underline"
                      >
                        <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <ellipse cx="12" cy="12" rx="3" ry="8" />
                          <path d="M2 12h20" />
                        </svg>
                        <span className="truncate max-w-[120px]">{cleanUIMetadata(s.title || s.url)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Completion indicator */}
              {tSteps.every((s) => s.status !== 'running') && (
                <div className="flex items-center gap-4 mt-1 relative z-10">
                  <div className="w-[16px] h-[16px] rounded-full flex items-center justify-center flex-shrink-0 border-[1.5px] border-zinc-400 text-zinc-500 ml-[0.5px]">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">
                    Concluído
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
