function createRemindersRoutes(context) {
  const { store, sendJson, normalizeReminder, saveStore, broadcast, parseTime } = context

  return async function handleRemindersRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/reminders' && req.method === 'GET') {
      sendJson(res, 200, store.reminders)
      return true
    }

    if (pathname === '/reminders/active' && req.method === 'GET') {
      const active = store.reminders
        .filter((reminder) => reminder.is_active)
        .sort((a, b) => parseTime(a.scheduled_time) - parseTime(b.scheduled_time))
      sendJson(res, 200, active)
      return true
    }

    if (pathname === '/reminders' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const reminder = normalizeReminder({ ...payload, id: store.next_reminder_id++ })
      store.reminders.push(reminder)
      saveStore()
      broadcast({ type: 'reminders_updated' })
      sendJson(res, 200, reminder)
      return true
    }

    if (pathname.startsWith('/reminders/') && req.method === 'PATCH') {
      const id = Number(pathname.split('/').pop())
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const reminder = store.reminders.find((item) => item.id === id)
      if (!reminder) {
        sendJson(res, 404, { detail: 'Reminder not found' })
        return true
      }
      Object.assign(reminder, payload)
      saveStore()
      broadcast({ type: 'reminders_updated' })
      sendJson(res, 200, reminder)
      return true
    }

    if (pathname.startsWith('/reminders/') && req.method === 'DELETE') {
      const id = Number(pathname.split('/').pop())
      store.reminders = store.reminders.filter((item) => item.id !== id)
      saveStore()
      broadcast({ type: 'reminders_updated' })
      sendJson(res, 200, { ok: true })
      return true
    }

    return false
  }
}

module.exports = { createRemindersRoutes }
