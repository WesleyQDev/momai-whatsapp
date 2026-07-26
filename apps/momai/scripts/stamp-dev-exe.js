const path = require('path')
const fs = require('fs')

if (process.platform !== 'win32') {
  process.exit(0)
}

const rootDir = path.resolve(__dirname, '..')
const icoPath = path.join(rootDir, 'build', 'icon.ico')
const pkg = require(path.join(rootDir, 'package.json'))

let electronExe
try {
  electronExe = require('electron')
} catch {
  process.exit(0)
}

if (!fs.existsSync(electronExe) || !fs.existsSync(icoPath)) {
  process.exit(0)
}

// 1. Create/Update dev Start Menu shortcut via PowerShell BEFORE electron starts
try {
  const { execSync } = require('child_process')
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  const shortcutDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const shortcutPath = path.join(shortcutDir, 'MomAI (Dev).lnk')

  const escapedExe = electronExe.replace(/'/g, "''")
  const escapedIco = icoPath.replace(/'/g, "''")
  const escapedShortcut = shortcutPath.replace(/'/g, "''")

  const psScript = `$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${escapedShortcut}'); $Shortcut.TargetPath = '${escapedExe}'; $Shortcut.IconLocation = '${escapedIco},0'; $Shortcut.Description = 'MomAI (Dev)'; $Shortcut.Save()`

  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { stdio: 'ignore' })
} catch (e) {
  // ignore shortcut creation errors
}

// 2. Stamp electron.exe binary with rcedit
async function stamp() {
  try {
    const { rcedit } = await import('rcedit')
    await rcedit(electronExe, {
      icon: icoPath,
      'version-string': {
        ProductName: 'MomAI (Dev)',
        FileDescription: 'MomAI (Dev)',
        CompanyName: pkg.author || 'WesleyQDev',
        LegalCopyright: `Copyright © ${new Date().getFullYear()} ${pkg.author || 'WesleyQDev'}`,
        OriginalFilename: 'electron.exe',
        InternalName: 'MomAI'
      }
    })
    console.log('[MomAI Dev] Stamped dev electron.exe with MomAI icon & metadata.')
  } catch (err) {
    // If electron.exe is currently locked/running, log notice
    console.log('[MomAI Dev] Pre-stamped dev executable check complete.')
  }

  // 3. Notify Windows Shell of icon cache update
  try {
    const { execSync } = require('child_process')
    const notifyPs = `$c = @'\nusing System;\nusing System.Runtime.InteropServices;\npublic class SN {\n    [DllImport("shell32.dll")]\n    public static extern void SHChangeNotify(uint e, uint f, IntPtr i1, IntPtr i2);\n    public static void R() { SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero); }\n}\n'@\nAdd-Type -TypeDefinition $c\n[SN]::R()`
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${notifyPs}"`, { stdio: 'ignore' })
  } catch (e) {
    // ignore shell notify errors
  }
}

stamp()
