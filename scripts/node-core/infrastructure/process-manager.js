const { spawn, execSync } = require('node:child_process')
const { log, debug, warn, error } = require('./logger')

const managedLlamaPids = new Map() // PID -> 'main' | 'embedding'
const portReservations = new Set()
let llamaSpawnLock = false

async function acquireSpawnLock() {
  while (llamaSpawnLock) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  llamaSpawnLock = true
}

function releaseSpawnLock() {
  llamaSpawnLock = false
}

function registerManagedLlama(proc, type = 'main') {
  if (!proc || !proc.pid) return
  const pid = proc.pid
  managedLlamaPids.set(pid, type)
  proc.on('exit', () => {
    managedLlamaPids.delete(pid)
  })
}

async function killOrphanLlamaServers(typeToKill = null) {
  try {
    const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    
    // First, kill processes that we KNOW we manage but want to replace
    if (typeToKill) {
      for (const [pid, type] of managedLlamaPids.entries()) {
        if (type === typeToKill) {
          log(`[guard] Killing managed ${type} llama-server PID: ${pid} to prepare for new spawn`)
          try {
            if (process.platform === 'win32') {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
            } else {
              process.kill(pid, 'SIGKILL')
            }
          } catch {}
          managedLlamaPids.delete(pid)
        }
      }
    }

    if (process.platform === 'win32') {
      const output = execSync(`tasklist /NH /FO CSV /FI "IMAGENAME eq ${exeName}"`, { encoding: 'utf8' })
      const lines = output.split('\n').filter((l) => l.trim().startsWith(`"${exeName}"`))
      for (const line of lines) {
        const parts = line.split(',')
        if (parts.length >= 2) {
          const pid = parseInt(parts[1].replace(/"/g, ''), 10)
          if (!isNaN(pid) && !managedLlamaPids.has(pid)) {
            log(`[guard] Killing orphan llama-server PID: ${pid}`)
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
            } catch {}
          }
        }
      }
    } else {
      try {
        const output = execSync(`pgrep -x ${exeName}`, { encoding: 'utf8' })
        const pids = output
          .split('\n')
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => !isNaN(p))
        for (const pid of pids) {
          if (!managedLlamaPids.has(pid)) {
            log(`[guard] Killing orphan llama-server PID: ${pid}`)
            try {
              process.kill(pid, 'SIGKILL')
            } catch {}
          }
        }
      } catch {}
    }
  } catch {}
}

module.exports = {
  managedLlamaPids,
  portReservations,
  acquireSpawnLock,
  releaseSpawnLock,
  registerManagedLlama,
  killOrphanLlamaServers
}
