export function createStorage() {
  const data = new Map<string, any>()

  return {
    async get<T>(key: string, opts?: { version?: string }): Promise<T | null> {
      const k = opts?.version ? `${key}@${opts.version}` : key
      return data.get(k) ?? null
    },
    async set(key: string, value: any): Promise<void> { data.set(key, value) },
    async getMany<T>(keys: string[]): Promise<Record<string, T | null>> {
      const result: Record<string, T | null> = {}
      for (const k of keys) result[k] = data.get(k) ?? null
      return result
    },
    async setMany(entries: Record<string, any>): Promise<void> {
      for (const [k, v] of Object.entries(entries)) data.set(k, v)
    },
    async delete(key: string): Promise<void> { data.delete(key) },
    async listKeys(): Promise<string[]> { return [...data.keys()] },
    async migrate(fromVersion: string, toVersion: string, fn: (old: any) => any): Promise<void> {
      const oldKey = `@${fromVersion}`
      const newKey = `@${toVersion}`
      const allKeys = [...data.keys()]
      for (const k of allKeys) {
        if (k.endsWith(oldKey)) {
          const baseKey = k.slice(0, -oldKey.length)
          const oldVal = data.get(k)
          if (oldVal !== undefined) {
            const migrated = fn(oldVal)
            data.set(`${baseKey}${newKey}`, migrated)
          }
        }
      }
    }
  }
}
