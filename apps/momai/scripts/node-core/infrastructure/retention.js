const { THREAD_RETENTION_DAYS } = require('../config/constants')

function isThreadStale(lastActivity, now = Date.now()) {
  if (!lastActivity) return false
  const ageDays = (now - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
  return ageDays > THREAD_RETENTION_DAYS
}

function pruneStaleThreads(store, now = Date.now()) {
  const removed = []
  for (const [threadId, messages] of Object.entries(store.thread_messages || {})) {
    const last = messages.length > 0 ? messages[messages.length - 1] : null
    const lastActivity = last ? last.created_at : null
    if (isThreadStale(lastActivity, now)) {
      delete store.thread_messages[threadId]
      if (store.session_titles) delete store.session_titles[threadId]
      removed.push(threadId)
    }
  }
  return removed
}

module.exports = { isThreadStale, pruneStaleThreads }
