import { join } from 'path'
import { existsSync, readdirSync, writeFileSync, unlinkSync } from 'fs'
import { spawn, spawnSync } from 'child_process'
import { logger } from '../../logger'
import { findBundledPythonDir, findManagedPythonDir } from './python-resolver'

export function removePthFiles(pythonDir: string): void {
  try {
    const entries = readdirSync(pythonDir)
    for (const entry of entries) {
      if (entry.endsWith('._pth')) {
        const pthPath = join(pythonDir, entry)
        unlinkSync(pthPath)
        logger.info(`[Bootstrap] Removed restrictive ._pth file: ${entry}`)
      }
    }
  } catch (e) {
    logger.warn('[Bootstrap] Could not clean ._pth files:', e)
  }
}

export function repairPyvenvCfg(venvPath: string): boolean {
  const pyvenvCfg = join(venvPath, 'pyvenv.cfg')
  if (existsSync(pyvenvCfg)) return true

  logger.warn('[Bootstrap] pyvenv.cfg missing after venv creation, attempting recovery...')

  const pythonDir = findBundledPythonDir() || findManagedPythonDir()
  if (!pythonDir) {
    logger.error('[Bootstrap] No Python found for pyvenv.cfg recovery')
    return false
  }

  try {
    const pythonBin = process.platform === 'win32' ? 'python.exe' : 'python3'
    if (!existsSync(join(pythonDir, pythonBin))) {
      logger.error('[Bootstrap] Could not find Python binary for pyvenv.cfg recovery')
      return false
    }

    writeFileSync(pyvenvCfg, `home = ${pythonDir}\ninclude-system-site-packages = false\n`, 'utf8')
    logger.info(`[Bootstrap] pyvenv.cfg recovered with home = ${pythonDir}`)
    return true
  } catch (e) {
    logger.error('[Bootstrap] Failed to recover pyvenv.cfg:', e)
    return false
  }
}

export async function createVenvWithPython(pythonExePath: string, venvPath: string): Promise<void> {
  logger.info(`[Bootstrap] Fallback: creating venv via python -m venv at ${venvPath}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pythonExePath, ['-m', 'venv', venvPath], {
      env: {
        ...process.env,
        VIRTUAL_ENV: undefined,
        PYTHONHOME: undefined,
        PYTHONPATH: undefined
      },
      shell: false,
      stdio: 'pipe',
      windowsVerbatimArguments: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data) => {
      const line = data.toString().trim()
      stdout += line
      logger.info(`[python -m venv] ${line}`)
    })
    child.stderr?.on('data', (data) => {
      const line = data.toString().trim()
      stderr += line
      logger.info(`[python -m venv stderr] ${line}`)
    })
    child.on('close', (code) => {
      if (code === 0) {
        logger.info('[Bootstrap] Fallback venv created successfully via python -m venv')
        resolve()
      } else {
        reject(new Error(stderr || stdout || `python -m venv failed with code ${code}`))
      }
    })
    child.on('error', reject)
  })
}

export async function checkVenvHealth(pythonExe: string, corePath: string): Promise<boolean> {
  if (!existsSync(pythonExe)) return false

  // 1) Interpreter sanity check
  const interpreterCheck = spawnSync(pythonExe, ['-c', 'import sys; print(sys.version)'], {
    timeout: 5000,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      PYTHONHOME: undefined,
      PYTHONPATH: undefined,
      VIRTUAL_ENV: undefined
    }
  })

  if (interpreterCheck.status !== 0) {
    const stderr = (interpreterCheck.stderr || '').toString().trim()
    logger.warn(
      `[Bootstrap] Venv interpreter check failed (code: ${interpreterCheck.status ?? 'unknown'}): ${stderr || 'no stderr output'}`
    )
    return false
  }

  // 2) Required deps check (first run can legitimately miss these before uv pip install)
  const depsProbeScript = [
    'import os, re, sys, tomllib',
    'md = __import__("importlib.metadata", fromlist=["version"])',
    'required_default = ["python-dotenv", "fastapi", "uvicorn", "sqlalchemy", "kokoro-onnx", "faster-whisper", "ctranslate2", "rapidfuzz"]',
    'required_default = [d for d in required_default if d]',
    'dist_names = []',
    'try:',
    '    pyproject = os.path.join(sys.argv[1], "pyproject.toml")',
    '    with open(pyproject, "rb") as f:',
    '        data = tomllib.load(f)',
    '    deps = data.get("project", {}).get("dependencies", []) or []',
    '    for dep in deps:',
    '        if not isinstance(dep, str):',
    '            continue',
    '        name = dep.split(";", 1)[0].strip()',
    '        name = name.split("[", 1)[0].strip()',
    '        name = re.split(r"[<>=!~ ]", name, 1)[0].strip()',
    '        if name:',
    '            dist_names.append(name)',
    'except Exception:',
    '    dist_names = []',
    'critical = [d for d in required_default if not dist_names or d in dist_names]',
    'if not critical:',
    '    critical = required_default',
    'missing = []',
    'for dist in critical:',
    '    try:',
    '        md.version(dist)',
    '    except Exception:',
    '        missing.append(dist)',
    'print(",".join(missing))'
  ].join('\n')

  const depsCheck = spawnSync(pythonExe, ['-c', depsProbeScript, corePath], {
    timeout: 5000,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      PYTHONHOME: undefined,
      PYTHONPATH: undefined,
      VIRTUAL_ENV: undefined
    }
  })

  if (depsCheck.status !== 0) {
    const stderr = (depsCheck.stderr || '').toString().trim()
    logger.warn(
      `[Bootstrap] Venv dependency probe failed (code: ${depsCheck.status ?? 'unknown'}): ${stderr || 'no stderr output'}`
    )
    return false
  }

  const missingDeps = (depsCheck.stdout || '').toString().trim()
  if (missingDeps) {
    logger.info(`[Bootstrap] Venv missing dependencies (expected before sync): ${missingDeps}`)
    return false
  }

  return true
}
