import React from 'react'
import ContainerChat from './ContainerChat'
import RemindersView from '../views/RemindersView'
import ExtensionsView from '../views/ExtensionsView'
import NotesView from '../views/NotesView'
import AboutView from '../views/AboutView'
import DynamicDashboard from './DynamicDashboard'
import { StatusData } from '../services/api'

interface MainViewRendererProps {
  viewName: string
  isCompact: boolean
  onOpenSettings: (tab?: any) => void
  extensionData?: any
  chat: any // Chat instance from App
  statusInfo: StatusData | null
  initProgress?: number
  visualProgress?: number
  initMessage?: string
  isBooting?: boolean
  setHistoryOpen?: (open: boolean) => void
  isFirstLaunch?: boolean
  isUpdating?: boolean
}

const ChatView = (props: any) => {
  return (
    <ContainerChat
      messages={props.chat.messages}
      isLoading={props.chat.isLoading}
      isModeChanging={props.isBooting || props.isUpdating}
      text={props.chat.text}
      onSendMessage={props.chat.sendMessage}
      onClearHistory={props.chat.clearHistory}
      messagesEndRef={props.chat.messagesEndRef}
      onReopenGraph={props.chat.reopenGraph}
      onGraphOption={props.chat.handleGraphOption}
      statusInfo={props.statusInfo}
      stopCurrentGeneration={props.chat.stopCurrentGeneration}
      stopCurrentVoice={props.chat.stopCurrentVoice}
      speakingMessageId={props.chat.speakingMessageId}
      isCallMode={props.chat.isCallMode}
      voiceStatus={props.chat.voiceStatus}
      voiceEngineLoading={props.chat.voiceEngineLoading}
      onToggleCallMode={props.chat.toggleCallMode}
      callHistory={props.chat.callHistory}
      initProgress={props.initProgress}
      visualProgress={props.visualProgress}
        initMessage={props.initMessage}
        isBooting={props.isBooting}
        threadId={props.chat.threadId}
      setThreadId={props.chat.setThreadId}
      setHistoryOpen={props.setHistoryOpen}
      onSpeakMessage={props.chat.speakMessage}
      onRemoveMessage={props.chat.removeMessage}
      onRegenerateMessage={props.chat.regenerateMessage}
      isFirstLaunch={props.isFirstLaunch}
      animationFinished={props.chat.animationFinished}
      setAnimationFinished={props.chat.setAnimationFinished}
    />
  )
}

const VIEW_MAP: Record<string, React.ComponentType<any>> = {
  ChatDashboard: ChatView,
  RemindersDashboard: RemindersView,
  NotesDashboard: NotesView,
  ExtensionsStore: ExtensionsView,
  AboutDashboard: AboutView,
  DynamicDashboard: DynamicDashboard
}

export default function MainViewRenderer({
  viewName,
  isCompact,
  onOpenSettings,
  extensionData,
  chat,
  statusInfo,
  initProgress,
  visualProgress,
  initMessage,
  isBooting,
  setHistoryOpen,
  isFirstLaunch,
  isUpdating
}: MainViewRendererProps) {
  const Component = VIEW_MAP[viewName] || (extensionData ? DynamicDashboard : null)

  const isChat = viewName === 'ChatDashboard'

  if (!Component) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        View not found: {viewName}
      </div>
    )
  }

  return (
    <div
      className={`flex min-h-0 ${isChat && !isCompact ? 'basis-[clamp(280px,46vw,820px)] min-w-[280px] lg:min-w-[420px] max-w-[820px] rounded-xl bg-card border border-border/10 shadow-2xl relative overflow-hidden shrink' : 'flex-1 w-full h-full'}`}
    >
      <Component
        onOpenSettings={onOpenSettings}
        title={extensionData?.name}
        description={extensionData?.description}
        extensionId={extensionData?.id}
        chat={chat}
        statusInfo={statusInfo}
        initProgress={initProgress}
        visualProgress={visualProgress}
        initMessage={initMessage}
        isBooting={isBooting}
        isUpdating={isUpdating}
        setHistoryOpen={setHistoryOpen}
        isFirstLaunch={isFirstLaunch}
      />
    </div>
  )
}
