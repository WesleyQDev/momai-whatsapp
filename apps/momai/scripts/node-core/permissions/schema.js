/**
 * MomAI Permission Schema
 *
 * Defines the structure and validation logic for extension permissions.
 */

function createPermissionSchema() {
  const RISKS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
  }

  const CAPABILITIES = {
    network: { risk: RISKS.HIGH, description: 'Acesso à rede' },
    'filesystem:read': { risk: RISKS.MEDIUM, description: 'Leitura de arquivos' },
    'filesystem:write': { risk: RISKS.HIGH, description: 'Escrita de arquivos' },
    'ui:sidebar': { risk: RISKS.LOW, description: 'Adicionar painéis na barra lateral' },
    'ui:commands': { risk: RISKS.LOW, description: 'Registrar comandos' },
    'chat:messages': { risk: RISKS.MEDIUM, description: 'Ler mensagens do chat' },
    'system:info': { risk: RISKS.LOW, description: 'Ver informações do sistema' },
    process: { risk: RISKS.CRITICAL, description: 'Acesso a processos do sistema' },
    shell: { risk: RISKS.CRITICAL, description: 'Execução de comandos shell' }
  }

  /**
   * Merges permissions from SKILL.md and optional manifest.json
   */
  function mergeManifestPermissions(primary = [], secondary = []) {
    const merged = {}

    // Normalize primary (array of strings)
    const primaryArray = Array.isArray(primary) ? primary : []
    for (const perm of primaryArray) {
      merged[perm] = { allowed: true }
    }

    // Merge secondary (array of strings or objects)
    const secondaryArray = Array.isArray(secondary) ? secondary : []
    for (const item of secondaryArray) {
      if (typeof item === 'string') {
        merged[item] = { allowed: true }
      } else if (item && item.id) {
        merged[item.id] = { ...item, allowed: true }
      }
    }

    return merged
  }

  /**
   * Calculates the overall risk level based on requested permissions
   */
  function calculateRiskLevel(permissions = {}) {
    let maxRisk = RISKS.LOW
    const riskOrder = [RISKS.LOW, RISKS.MEDIUM, RISKS.HIGH, RISKS.CRITICAL]

    for (const id in permissions) {
      const cap = CAPABILITIES[id] || { risk: RISKS.MEDIUM }
      if (riskOrder.indexOf(cap.risk) > riskOrder.indexOf(maxRisk)) {
        maxRisk = cap.risk
      }
    }

    return maxRisk
  }

  /**
   * Returns a list of human-readable descriptions for permissions
   */
  function getPermissionSummary(permissions = {}) {
    return Object.keys(permissions).map((id) => {
      const cap = CAPABILITIES[id]
      return cap ? cap.description : id
    })
  }

  function needsAnyPermission(permissions = {}) {
    return Object.keys(permissions).length > 0
  }

  return {
    CAPABILITIES,
    RISKS,
    mergeManifestPermissions,
    calculateRiskLevel,
    getPermissionSummary,
    needsAnyPermission
  }
}

module.exports = { createPermissionSchema }
