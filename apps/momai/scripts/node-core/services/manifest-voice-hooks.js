async function resolveVoiceReply(originalContent, skills, hostManager) {
  if (!Array.isArray(skills)) return null
  for (const skill of skills) {
    const hook = skill?.manifest?.voiceHooks?.reply
    if (!hook || !hook.tool || !hook.promptTemplate) continue
    let result
    try {
      result = await hostManager.sendToPersistent(skill.id, { toolName: hook.tool, args: {} })
    } catch {
      continue
    }
    const last = result?.history?.[0]
    if (!last) continue
    const injected = hook.promptTemplate
      .replace('{contactName}', last.from || '')
      .replace('{lastMessage}', last.text || '')
    return `${injected}\n${originalContent}`
  }
  return null
}

module.exports = { resolveVoiceReply }
