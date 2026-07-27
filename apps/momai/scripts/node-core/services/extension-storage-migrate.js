const migrationRegistry = new Map()

function registerMigration(fromVersion, toVersion, fn) {
  const key = `${fromVersion}->${toVersion}`
  migrationRegistry.set(key, fn)
}

async function runMigrations(extId, fromVersion, toVersion) {
  const migrated = []
  for (const [key, fn] of migrationRegistry) {
    const [from, to] = key.split('->')
    if (from === fromVersion) {
      await fn(extId)
      migrated.push(key)
    }
  }
  return migrated
}

module.exports = { registerMigration, runMigrations }
