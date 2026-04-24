const { execSync } = require('child_process')
async function test() {
  try {
    const rcedit = await import('rcedit')
    console.log('Keys of rcedit module:', Object.keys(rcedit))
    console.log('Type of rcedit.default:', typeof rcedit.default)
    console.log('Type of rcedit.rcedit:', typeof rcedit.rcedit)
  } catch (e) {
    console.error('Failed to import rcedit:', e)
  }
}
test()
