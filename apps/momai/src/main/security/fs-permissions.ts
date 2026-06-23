import { writeFileSync, chmodSync, writeFile } from 'node:fs'
import { promisify } from 'node:util'

const writeFileAsync = promisify(writeFile)

export function secureWriteFileSync(path: string, data: string | Buffer): void {
  writeFileSync(path, data)
  try {
    chmodSync(path, 0o600)
  } catch {
    // Windows doesn't honor Unix perms; rely on ACLs
  }
}

export async function secureWriteFile(path: string, data: string | Buffer): Promise<void> {
  await writeFileAsync(path, data)
  try {
    chmodSync(path, 0o600)
  } catch {}
}
