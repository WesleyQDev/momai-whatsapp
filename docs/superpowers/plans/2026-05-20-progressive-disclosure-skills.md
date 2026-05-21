# Progressive Disclosure Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Replace 11-tool flat exposure with 2-round progressive disclosure (`use_skill` → skill-specific tools + SKILL.md body).

**Architecture:** Round 1: only `use_skill` tool + skill descriptions. LLM chooses a skill. Round 2: SKILL.md body injected + only that skill's tools exposed.

**Tech Stack:** Node.js, llama.cpp OpenAI-compatible API, LanceDB vector search

---

### Task 1: Add `buildUseSkillTool()` to registry.js

**Files:**
- Modify: `scripts/skills/registry.js` (add function + export)

- [ ] **Add function after `toOpenAITools`:**

In `scripts/skills/registry.js`, add before the return statement:

```js
function buildUseSkillTool(skills) {
  const names = skills.map((s) => s.id)
  const desc = skills
    .map((s) => `${s.id}: ${(s.manifest.description || '').slice(0, 80)}`)
    .join('\n')
  return {
    type: 'function',
    function: {
      name: 'use_skill',
      description: `Ativa uma skill especializada para responder a pergunta do usuario.\n\nSkills disponiveis:\n${desc}`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: names,
            description: `Nome da skill a ativar: ${names.join(', ')}`
          }
        },
        required: ['name']
      }
    }
  }
}
```

- [ ] **Export it**: Add `buildUseSkillTool` to the returned object in `createSkillRegistry`.

---

### Task 2: Fix semantic-engine.js to force real embedding

**Files:**
- Modify: `scripts/node-core/services/semantic-engine.js`

- [ ] **Remove early return for `<= 5` skills:**

In `getTop5SkillsSemantic()`, change:

```js
if (!text || !semanticState.ready || enabledSkills.length <= 5) {
  return enabledSkills.slice(0, 5).map((s) => ({ id: s.id, score: 0.5 }))
}
```

To:

```js
if (!text || !semanticState.ready) {
  return enabledSkills.slice(0, 5).map((s) => ({ id: s.id, score: 0.5 }))
}
```

This forces real embedding query even with 5 or fewer skills.

---

### Task 3: Modify chat-service.js round loop

**Files:**
- Modify: `scripts/node-core/services/chat-service.js`

- [ ] **Add state variable after `const scoreMap = {}`:**

```js
let activeSkillId = null
let skillActivatedThisRound = false
```

- [ ] **Replace the discovery + tool building block (lines ~948-986):**

The new flow:

```js
{
  const top5SkillIds = await (async () => {
    if (isUltra) {
      const semanticResults = await getTop5SkillsSemantic(content)
      if (semanticResults.length > 0) {
        for (const r of semanticResults) scoreMap[r.id] = r.score
        return semanticResults.map((r) => r.id)
      }
      debug('[chat] Semantic search returned 0 skills, falling back to lexical')
    }
    if (skillRegistry && typeof skillRegistry.discoverTopN === 'function') {
      const discovered = skillRegistry.discoverTopN(content, 5)
      if (discovered.length > 0) {
        debug(`[chat] Lexical discovery found: ${discovered.map((d) => `${d.id}(${d.confidence.toFixed(2)})`).join(', ')}`)
        for (const d of discovered) scoreMap[d.id] = d.confidence
        return discovered.map((d) => d.id)
      }
    }
    return []
  })()

  const allSelectedSkills = top5SkillIds
    .map((id) => skillRegistry?.getById?.(id))
    .filter(Boolean)

  if (activeSkillId) {
    // Round 2+: expose only tools of the active skill + SKILL.md body
    const skillObj = allSelectedSkills.find((s) => s.id === activeSkillId)
    availableSkillDescs = skillObj
      ? `# SKILL ATIVA: ${skillObj.manifest.name}\n${skillObj.manifest.description}`
      : null
    if (skillObj?.manifest?.instructions) {
      extraSystemInstructions.push(
        `[INSTRUCOES DA SKILL ${skillObj.manifest.name}]\n${skillObj.manifest.instructions}`
      )
    }
    if (skillRegistry && typeof skillRegistry.toOpenAITools === 'function') {
      toolsPayload = skillRegistry.toOpenAITools([activeSkillId])
    }
  } else {
    // Round 1: expose only use_skill tool + descriptions
    availableSkillDescs = allSelectedSkills.length
      ? `# SKILLS DISPONIVEIS\n${allSelectedSkills.map((s) => `- ${s.manifest.name}: ${s.manifest.description}`).join('\n')}`
      : null
    if (skillRegistry && typeof skillRegistry.buildUseSkillTool === 'function') {
      const useSkillTool = skillRegistry.buildUseSkillTool(allSelectedSkills)
      if (useSkillTool) toolsPayload = [useSkillTool]
    }
  }
}
```

- [ ] **Add `use_skill` handler in the tool execution block (after line ~1296):**

After `args = JSON.parse(rawArgs)` and before resolving skillId:

```js
if (toolName === 'use_skill') {
  const skillName = args?.name
  const targetSkill = allSelectedSkills.find((s) => s.id === skillName || s.manifest.name === skillName)
  if (targetSkill) {
    activeSkillId = targetSkill.id
    messages.push({
      role: 'tool',
      tool_call_id: tc.id || `call_${toolName}`,
      content: `Skill "${skillName}" ativada. Use as ferramentas disponiveis para responder.`
    })
    executedTools.push({ name: toolName, result: `activated ${skillName}` })
    skillActivatedThisRound = true
  } else {
    messages.push({
      role: 'tool',
      tool_call_id: tc.id || `call_${toolName}`,
      content: `Skill "${skillName}" nao encontrada. Skills disponiveis: ${allSelectedSkills.map((s) => s.id).join(', ')}`
    })
    executedTools.push({ name: toolName, result: `skill not found` })
  }
  continue // skip the rest of the tool execution (no skill.execute call needed)
}
```

- [ ] **Reset activeSkillId at the start of each user message:**

Before the while loop starts, add:

```js
activeSkillId = null
skillActivatedThisRound = false
```

(This should be placed where `directSkillResult` was initialized, which we already cleaned up.)

---

### Task 4: Run tests

**Files:**
- Run: `scripts/` project tests

- [ ] **Run and verify:**

```
cd apps/momai && pnpm test -- --project scripts
```

Expected: All weather-runtime, registry-discover, and existing node-core tests pass.
