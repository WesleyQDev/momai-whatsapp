/**
 * Extension Scheduler Service
 * Manages cron-based scheduled tasks for extensions.
 */

class ExtensionScheduler {
  constructor(extensionHostManager) {
    this.extensionHostManager = extensionHostManager
    this.jobs = new Map() // extId -> Set<{ cron, tool, interval }>
  }

  registerSchedule(extId, cronExpression, toolName) {
    if (this.jobs.has(extId) && this.jobs.get(extId).has(cronExpression + toolName)) return
    
    if (!this.jobs.has(extId)) this.jobs.set(extId, new Set())
    
    const parseCron = (cron) => {
      const parts = cron.split(' ')
      if (parts.length !== 5) throw new Error(`Invalid cron expression: ${cron}`)
      const getVal = (part) => part === '*' ? null : parseInt(part, 10)
      return { minute: getVal(parts[0]), hour: getVal(parts[1]), dayOfMonth: getVal(parts[2]), month: getVal(parts[3]), dayOfWeek: getVal(parts[4]) }
    }

    const schedule = parseCron(cronExpression)
    
    const interval = setInterval(() => {
      const now = new Date()
      const min = schedule.minute
      const hour = schedule.hour
      
      if (min !== null && min !== now.getMinutes()) return
      if (hour !== null && hour !== now.getHours()) return
      
      this.extensionHostManager.sendToPersistent(extId, { toolName, args: {} }).catch(() => {})
    }, 60000) // Check every minute

    this.jobs.get(extId).add({ cron: cronExpression, tool: toolName, interval })
  }

  unregisterExtension(extId) {
    if (!this.jobs.has(extId)) return
    for (const job of this.jobs.get(extId)) {
      clearInterval(job.interval)
    }
    this.jobs.delete(extId)
  }

  unregisterAll() {
    for (const [extId] of this.jobs) {
      this.unregisterExtension(extId)
    }
  }
}

module.exports = { ExtensionScheduler }
