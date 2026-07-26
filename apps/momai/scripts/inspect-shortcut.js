const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const devPath = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'MomAI (Dev).lnk')
const prodPath = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'MomAI.lnk')

function inspect(lnkPath) {
  if (!fs.existsSync(lnkPath)) {
    console.log(lnkPath, 'DOES NOT EXIST')
    return
  }
  const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath.replace(/'/g, "''")}'); Write-Host ('Target: ' + $s.TargetPath); Write-Host ('Icon: ' + $s.IconLocation)`
  const res = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, { encoding: 'utf-8' })
  console.log(lnkPath, ':\n', res.trim())
}

console.log('=== DEV SHORTCUT ===')
inspect(devPath)
console.log('=== PROD SHORTCUT ===')
inspect(prodPath)
