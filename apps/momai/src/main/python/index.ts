// Main Python module - exports all functionality from sub-modules

// Export types
export type {
  AITier,
  BootstrapResult,
  SyncResult,
  PythonBackendStartOptions,
  BootstrapError,
  BootstrapErrorType
} from './types'

// Export bootstrap functions
export {
  getUserDataPath,
  UV_CACHE_PATH,
  UV_PYTHON_INSTALL_PATH,
  isOnboardingCompleted,
  saveOnboardingCompleted,
  getSyncLock,
  setSyncLock,
  isPortReachable,
  waitForPort,
  waitForPythonExit,
  bootstrapPython
} from './bootstrap'

// Export backend management functions
export {
  startPythonBackend,
  killPythonBackend,
  killProcessOnPort,
  shutdownPython,
  isPythonRunning,
  restartPythonBackend,
  stopPythonHealthCheck,
  startPythonHealthCheck
} from './backend-manager'

// Export utility functions
export {
  killAllLlamaServers,
  checkWritePermission,
  delay,
  buildEnv,
  findVCLibsDirs
} from './utils/fs-helpers'
export {
  sendErrorToRenderer,
  sendInitProgress,
  broadcastPythonStatus
} from './utils/process-helpers'

// Export tier detection
export { getCurrentTier, isAITier } from './bootstrap/tier-detector'

// Export Python resolution
export {
  findBundledPythonDir,
  findManagedPythonDir,
  verifyManagedPython,
  getPlatformResourceKey
} from './bootstrap/python-resolver'

// Export venv management
export {
  createVenvWithPython,
  checkVenvHealth,
  repairPyvenvCfg,
  removePthFiles
} from './bootstrap/venv-manager'

// Export VC Redistributable
export { isVCRedistInstalled, runVCRedistInstaller, ensureVCRedist } from './bootstrap/vc-redist'

// Export uv-runner functions
export { ensureUvEnvironment, createVenvWithUv, syncDependencies } from './bootstrap/uv-runner'

// Default export for backward compatibility
import { bootstrapPython } from './bootstrap'
import {
  startPythonBackend,
  killPythonBackend,
  killProcessOnPort,
  shutdownPython,
  isPythonRunning
} from './backend-manager'
import { killAllLlamaServers } from './utils/fs-helpers'

export default {
  bootstrapPython,
  startPythonBackend,
  killPythonBackend,
  killProcessOnPort,
  shutdownPython,
  isPythonRunning,
  killAllLlamaServers
}
