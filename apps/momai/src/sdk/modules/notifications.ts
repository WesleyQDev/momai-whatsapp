export function createNotifications() {
  return {
    async send(opts: { title: string; body?: string; action?: string }): Promise<void> {
      if (typeof Notification !== 'undefined') {
        const notif = new Notification(opts.title, {
          body: opts.body || '',
          data: { action: opts.action }
        })
        if (opts.action) {
          notif.onclick = () => {
            (window as any).api?.send?.('trigger-action', opts.action)
          }
        }
      }
    }
  }
}
