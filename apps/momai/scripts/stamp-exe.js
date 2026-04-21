const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const pkg = require('../package.json')

const EXE_PATH = path.join(__dirname, '..', 'dist', 'win-unpacked', `${pkg.productName}.exe`)
const ICO_PATH = path.join(__dirname, '..', 'build', 'icon.ico')

if (!fs.existsSync(EXE_PATH)) {
  console.error(`[stamp-exe] Executable not found: ${EXE_PATH}`)
  process.exit(1)
}

if (!fs.existsSync(ICO_PATH)) {
  console.error(`[stamp-exe] Icon not found: ${ICO_PATH}`)
  process.exit(1)
}

async function main() {
  const { rcedit } = await import('rcedit')

  console.log(`[stamp-exe] Stamping ${path.basename(EXE_PATH)} with MomAI metadata...`)

  await rcedit(EXE_PATH, {
    icon: ICO_PATH,
    'version-string': {
      ProductName: pkg.productName,
      FileDescription: pkg.description || pkg.productName,
      CompanyName: pkg.author || 'WesleyQDev',
      LegalCopyright: `Copyright © ${new Date().getFullYear()} ${pkg.author || 'WesleyQDev'}`,
      OriginalFilename: `${pkg.productName}.exe`,
      InternalName: pkg.productName
    },
    'file-version': pkg.version,
    'product-version': pkg.version
  })

  console.log(`[stamp-exe] Done! Executable now branded as "${pkg.productName}".`)
}

main().catch((err) => {
  console.error('[stamp-exe] Failed:', err)
  process.exit(1)
})
