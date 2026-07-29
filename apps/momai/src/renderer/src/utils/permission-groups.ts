const PERMISSION_GROUP_MAP: Record<string, string> = {
  network: 'network',
  'network:persistent': 'network',
  'network:read': 'network',
  'network:write': 'network',
  'storage:read': 'storage',
  'storage:write': 'storage',
  'storage:persistent': 'storage',
  'filesystem:read': 'storage',
  'filesystem:write': 'storage',
  'system:info': 'system',
  process: 'system',
  shell: 'system',
  'ui:sidebar': 'ui',
  'ui:commands': 'ui',
  'ui:panel': 'ui',
  'chat:messages': 'chat',
  notifications: 'notifications',
  browser: 'browser',
  oauth: 'oauth',
  scheduler: 'scheduler',
  events: 'events',
  llm: 'llm',
  config: 'config',
  registry: 'registry'
}

export function getPermissionGroup(perm: string): string {
  return PERMISSION_GROUP_MAP[perm] || 'other'
}

export function groupPermissions(perms: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const perm of perms) {
    const group = getPermissionGroup(perm)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(perm)
  }
  return groups
}
