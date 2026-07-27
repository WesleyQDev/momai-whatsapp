const PERMISSION_MAP = {
  'network': { risk: 'high', description: 'Access network' },
  'filesystem:read': { risk: 'medium', description: 'Read files' },
  'filesystem:write': { risk: 'high', description: 'Write files' },
  'ui:sidebar': { risk: 'low', description: 'Add sidebar panels' },
  'ui:commands': { risk: 'low', description: 'Register commands' },
  'ui:theme': { risk: 'low', description: 'Modify theme colors' },
  'chat:messages': { risk: 'medium', description: 'Read chat messages' },
  'system:info': { risk: 'low', description: 'View system info' },
  'process': { risk: 'critical', description: 'Access system processes' },
  'shell': { risk: 'critical', description: 'Execute shell commands' },
  'scheduler': { risk: 'medium', description: 'Run scheduled tasks' },
  'oauth': { risk: 'medium', description: 'OAuth authentication' }
}

function checkPermission(declaredPermissions, requiredPermission) {
  if (!declaredPermissions || !Array.isArray(declaredPermissions)) {
    return { allowed: false, error: 'permission_denied', risk: null }
  }
  if (!declaredPermissions.includes(requiredPermission)) {
    return { allowed: false, error: 'permission_denied', risk: PERMISSION_MAP[requiredPermission]?.risk || null }
  }
  return { allowed: true, error: null, risk: PERMISSION_MAP[requiredPermission]?.risk || 'low' }
}

function getPermissionInfo(permissionId) {
  return PERMISSION_MAP[permissionId] || { risk: 'unknown', description: permissionId }
}

module.exports = { checkPermission, getPermissionInfo, PERMISSION_MAP }
