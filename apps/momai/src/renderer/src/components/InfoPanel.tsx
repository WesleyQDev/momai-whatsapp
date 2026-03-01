import { useNavigate } from 'react-router-dom'
import RemindersSidebar from './chat/RemindersSidebar'
import { ChatHistoryPopover } from './chat/ChatHistoryPopover'
import { AssistantStatus } from './AssistantStatus'

interface InfoPanelProps {
  statusInfo: any
  settings: any
  chat: any
  historyOpen: boolean
  setHistoryOpen: (open: boolean) => void
}

const InfoPanel = ({ statusInfo, settings, chat, historyOpen, setHistoryOpen }: InfoPanelProps) => {
  const navigate = useNavigate()
  
  const currentTier = localStorage.getItem('momai_ai_tier') || statusInfo?.ai_tier || settings?.ai_tier || 'pro'
  
  const isThinking = chat.voiceStatus === 'processing' || chat.isLoading || statusInfo?.is_loading

  return (
    <div className="w-[300px] flex flex-col gap-2 h-full shrink-0">
      {/* Componente que exibe o Status/Modo/Luna */}
      <AssistantStatus currentTier={currentTier} isThinking={isThinking} />

      <div className="flex-1 rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative flex flex-col">
        <RemindersSidebar onNavigate={() => navigate('/agenda')} />
        {historyOpen && (
          <div className="absolute inset-0 z-20">
            <ChatHistoryPopover
              threadId={chat.threadId}
              setThreadId={chat.setThreadId}
              isOpen={historyOpen}
              setIsOpen={setHistoryOpen}
              isSidebarVariant
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default InfoPanel
