import { ipcMain } from 'electron'
import { getTTSService, resetTTSService, TTSEngine } from './ttsService'

export function setupTTSHandlers() {
  const ttsService = getTTSService()

  // Obter engines disponíveis
  ipcMain.handle('tts:get-engines', () => {
    return ttsService.getSupportedEngines()
  })

  // Obter informações de uma engine específica
  ipcMain.handle('tts:get-engine-info', (_event, engine: TTSEngine) => {
    return ttsService.getEngineInfo(engine)
  })

  // Obter vozes disponíveis para uma engine
  ipcMain.handle('tts:get-voices', async (_event, engine?: TTSEngine) => {
    try {
      const voices = await ttsService.getAvailableVoices(engine)
      return { success: true, voices }
    } catch (error) {
      console.error('[TTS IPC] Erro ao obter vozes:', error)
      return { success: false, error: String(error) }
    }
  })

  // Falar texto
  ipcMain.handle('tts:speak', async (_event, text: string, engine?: TTSEngine) => {
    try {
      await ttsService.speak(text, engine)
      return { success: true }
    } catch (error) {
      console.error('[TTS IPC] Erro ao falar:', error)
      return { success: false, error: String(error) }
    }
  })

  // Parar fala
  ipcMain.handle('tts:stop', () => {
    ttsService.stop()
    return { success: true }
  })

  // Definir engine
  ipcMain.handle('tts:set-engine', (_event, engine: TTSEngine) => {
    ttsService.setEngine(engine)
    return { success: true, engine }
  })

  // Definir voz
  ipcMain.handle('tts:set-voice', (_event, voice: string) => {
    ttsService.setVoice(voice)
    return { success: true, voice }
  })

  // Definir velocidade
  ipcMain.handle('tts:set-speed', (_event, speed: number) => {
    ttsService.setSpeed(speed)
    return { success: true, speed }
  })

  // Habilitar/desabilitar TTS
  ipcMain.handle('tts:set-enabled', (_event, enabled: boolean) => {
    ttsService.setEnabled(enabled)
    return { success: true, enabled }
  })

  // Obter configuração atual
  ipcMain.handle('tts:get-config', () => {
    return { success: true, config: ttsService.getConfig() }
  })

  // Atualizar configuração
  ipcMain.handle('tts:update-config', (_event, config: any) => {
    ttsService.updateConfig(config)
    return { success: true, config: ttsService.getConfig() }
  })

  // Verificar se está falando
  ipcMain.handle('tts:is-speaking', () => {
    return { success: true, isSpeaking: ttsService.isCurrentlySpeaking() }
  })

  // Eventos do serviço TTS
  ttsService.on('speaking-start', (data) => {
    // Notificar todas as janelas
    const windows = require('electron').BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('tts:speaking-start', data)
      }
    })
  })

  ttsService.on('speaking-end', () => {
    const windows = require('electron').BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('tts:speaking-end')
      }
    })
  })

  ttsService.on('error', (error) => {
    const windows = require('electron').BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('tts:error', error)
      }
    })
  })

  ttsService.on('play-audio-buffer', (buffer: Buffer) => {
    const windows = require('electron').BrowserWindow.getAllWindows()
    console.log(`[TTS IPC] play-audio-buffer: windows=${windows.length}, buf=${buffer.length}`)
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        const isMp3 = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0
        const base64 = buffer.toString('base64')
        console.log(
          `[TTS IPC] Sending tts:play-audio-buffer to window, base64 len=${base64.length}`
        )
        win.webContents.send('tts:play-audio-buffer', {
          data: base64,
          mimeType: isMp3 ? 'audio/mpeg' : 'audio/wav'
        })
      } else {
        console.warn('[TTS IPC] Window is destroyed, skipping')
      }
    })
  })

  ttsService.on('engine-changed', (engine) => {
    const windows = require('electron').BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('tts:engine-changed', engine)
      }
    })
  })

  ttsService.on('voice-changed', (voice) => {
    const windows = require('electron').BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('tts:voice-changed', voice)
      }
    })
  })

  console.log('[TTS IPC] Handlers configurados com sucesso')
}

export function cleanupTTSHandlers() {
  // Remover todos os handlers do IPC
  const handlers = [
    'tts:get-engines',
    'tts:get-engine-info',
    'tts:get-voices',
    'tts:speak',
    'tts:stop',
    'tts:set-engine',
    'tts:set-voice',
    'tts:set-speed',
    'tts:set-enabled',
    'tts:get-config',
    'tts:update-config',
    'tts:is-speaking'
  ]

  handlers.forEach((handler) => {
    ipcMain.removeHandler(handler)
  })

  // Resetar serviço
  resetTTSService()

  console.log('[TTS IPC] Handlers limpos')
}
