const KNOWN_METHODS = new Set([
  'api.get', 'api.post', 'api.put', 'api.delete',
  'storage.get', 'storage.set', 'storage.getMany', 'storage.setMany',
  'storage.delete', 'storage.migrate', 'storage.listKeys',
  'events.subscribe', 'events.unsubscribe', 'events.once',
  'llm.complete',
  'registry.registerRenderer', 'registry.getRenderer', 'registry.hasRenderer', 'registry.listRendererTypes',
  'notifications.send',
  'theme.setColors', 'theme.setFont', 'theme.getCurrentTheme',
  'scheduler.cron',
  'oauth.authorize',
  'config.get', 'config.set', 'config.delete',
  'process.spawn',
  'system.mouse.click', 'system.mouse.move', 'system.keyboard.type', 'system.keyboard.press', 'system.screen.capture',
  'browser.open', 'browser.evaluate', 'browser.screenshot',
  'has', 'dev.reload', 'dev.log'
])

export function createHas() {
  return {
    has(method: string): boolean {
      return KNOWN_METHODS.has(method)
    }
  }
}
