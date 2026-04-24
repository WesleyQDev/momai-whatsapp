const path = require('path')
const fs = require('fs')

const pkg = require('../package.json')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico')

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] Executable not found: ${exePath}, skipping`)
    return
  }

  if (!fs.existsSync(icoPath)) {
    console.warn(`[after-pack] Icon not found: ${icoPath}, skipping`)
    return
  }

  console.log(`[after-pack] Stamping ${path.basename(exePath)} with MomAI metadata...`)

  const { rcedit } = await import('rcedit')

  await rcedit(exePath, {
    icon: icoPath,
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

  console.log(`[after-pack] Done! Executable branded as "${pkg.productName}".`)
}
