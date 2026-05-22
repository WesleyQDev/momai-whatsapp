const path = require('path')
const fs = require('fs')

const registryModule = require(path.resolve(__dirname, '../apps/momai/scripts/skills/registry.js'))

const dataDir = path.resolve(__dirname, '../.dev-data')
const builtinSkillsDir = path.resolve(__dirname, '../apps/momai/scripts/skills/core')

const registry = registryModule.createSkillRegistry({
  dataDir,
  builtinSkillsDir
})

async function runTest() {
  console.log('--- Testing README vs SKILL.md fallback ---\n')
  await registry.refresh()

  const payload = registry.toListPayload()
  console.log(`Total skills: ${payload.length}\n`)

  let allPassed = true

  for (const skill of payload) {
    const skillDir = (() => {
      const corePath = path.join(builtinSkillsDir, skill.id)
      if (fs.existsSync(corePath)) return corePath
      const packagedPath = path.resolve(__dirname, '../apps/momai/scripts/skills/packaged', skill.id)
      if (fs.existsSync(packagedPath)) return packagedPath
      return null
    })()

    const hasReadme = skillDir && fs.existsSync(path.join(skillDir, 'README.md'))
    const hasSkillMd = skillDir && fs.existsSync(path.join(skillDir, 'SKILL.md'))

    const readmeContent = skill.readme || ''
    const instrContent = skill.instructions || ''

    console.log(`[${skill.id}]`)
    console.log(`  Has README.md: ${hasReadme}`)
    console.log(`  Has SKILL.md: ${hasSkillMd}`)
    console.log(`  readme length: ${readmeContent.length}`)
    console.log(`  instructions length: ${instrContent.length}`)

    if (!hasReadme && readmeContent.length > 0) {
      console.log(`  ❌ FAIL: No README.md but readme content is non-empty (SKILL.md leaked!)`)
      console.log(`  Content sample: "${readmeContent.substring(0, 100)}..."`)
      allPassed = false
    } else if (!hasReadme && readmeContent.length === 0) {
      console.log(`  ✅ PASS: No README.md -> empty readme (correct)`)
    } else if (hasReadme && readmeContent.length > 0) {
      console.log(`  ✅ PASS: Has README.md -> readme populated`)
    } else if (hasReadme && readmeContent.length === 0) {
      console.log(`  ⚠️ WARN: Has README.md but readme is empty`)
    }
    console.log()
  }

  console.log(allPassed ? '\n✅ ALL TESTS PASSED' : '\n❌ SOME TESTS FAILED')
}

runTest()
