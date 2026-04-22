const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const distDir = path.resolve(__dirname, '../dist')
const certPath = path.resolve(__dirname, '../../../momai_certificado.pfx')
const password = 'momai2026'
const CACHE_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
  'momai-build-cache',
  'signtool'
)

const appxFile = fs.readdirSync(distDir).find((f) => f === 'MomAI-Teste.appx')

if (!appxFile) {
  console.error('Arquivo MomAI-Teste.appx nao encontrado em dist/')
  process.exit(1)
}

const appxPath = path.join(distDir, appxFile)

function findSdkSigntool() {
  const sdkPaths = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
    'C:\\Program Files\\Windows Kits\\10\\bin'
  ]

  for (const sdkBase of sdkPaths) {
    if (!fs.existsSync(sdkBase)) continue
    const versions = fs.readdirSync(sdkBase).filter((d) => d.startsWith('10.'))
    versions.sort().reverse()
    for (const ver of versions) {
      const candidate = path.join(sdkBase, ver, 'x64', 'signtool.exe')
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return ''
}

function findCachedSigntool() {
  const candidate = path.join(CACHE_DIR, 'x64', 'signtool.exe')
  if (fs.existsSync(candidate)) return candidate
  return ''
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const handler = (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location
        const mod = redirectUrl.startsWith('https') ? https : http
        mod.get(redirectUrl, handler).on('error', reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }
    https.get(url, handler).on('error', reject)
  })
}

async function downloadModernSigntool() {
  console.log('--- Downloading modern signtool from NuGet (Microsoft.Windows.SDK.BuildTools)... ---')

  const nugetIndexUrl =
    'https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.buildtools/index.json'
  const indexData = await downloadFile(nugetIndexUrl)
  const index = JSON.parse(indexData.toString())
  const latestVersion = index.versions[index.versions.length - 1]

  console.log(`--- Using SDK BuildTools version: ${latestVersion} ---`)

  const nupkgUrl = `https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.buildtools/${latestVersion}/microsoft.windows.sdk.buildtools.${latestVersion}.nupkg`

  const nupkgData = await downloadFile(nupkgUrl)

  const tempNupkg = path.join(CACHE_DIR, '_sdk.nupkg.zip')
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(tempNupkg, nupkgData)

  const extractDir = path.join(CACHE_DIR, '_extract')
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })

  execSync(
    `powershell -Command "Expand-Archive -Path '${tempNupkg}' -DestinationPath '${extractDir}' -Force"`,
    { stdio: 'inherit' }
  )

  let signtoolSrc = ''
  const searchInDir = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        searchInDir(full)
      } else if (
        entry.name.toLowerCase() === 'signtool.exe' &&
        full.toLowerCase().includes('x64')
      ) {
        signtoolSrc = full
      }
    }
  }
  searchInDir(extractDir)

  if (!signtoolSrc) {
    throw new Error('signtool.exe x64 not found inside NuGet package')
  }

  const targetDir = path.join(CACHE_DIR, 'x64')
  fs.mkdirSync(targetDir, { recursive: true })

  const signtoolDest = path.join(targetDir, 'signtool.exe')
  fs.copyFileSync(signtoolSrc, signtoolDest)

  const srcDir = path.dirname(signtoolSrc)
  for (const f of fs.readdirSync(srcDir)) {
    if (f.toLowerCase().endsWith('.dll') || f.toLowerCase().endsWith('.exe')) {
      fs.copyFileSync(path.join(srcDir, f), path.join(targetDir, f))
    }
  }

  fs.rmSync(extractDir, { recursive: true, force: true })
  try {
    fs.unlinkSync(tempNupkg)
  } catch {}

  console.log('--- signtool.exe downloaded and cached successfully. ---')
  return signtoolDest
}

async function main() {
  let signtoolPath = findSdkSigntool()

  if (signtoolPath) {
    console.log('--- Using Windows SDK signtool ---')
  } else {
    signtoolPath = findCachedSigntool()
    if (signtoolPath) {
      console.log('--- Using cached modern signtool ---')
    } else {
      signtoolPath = await downloadModernSigntool()
    }
  }

  console.log('--- Assinando ' + appxFile + ' ---')
  console.log('SignTool: ' + signtoolPath)

  try {
    execSync(
      `"${signtoolPath}" sign /fd SHA256 /a /f "${certPath}" /p "${password}" "${appxPath}"`,
      { stdio: 'inherit' }
    )
    console.log('--- APPX assinado com sucesso! ---')
  } catch (err) {
    console.error('Falha ao assinar:', err.message)
    process.exit(1)
  }

  console.log('--- Instalando certificado nas lojas de confianca... ---')
  installCertificate()
}

function installCertificate() {
  const ps1 = `
$ErrorActionPreference = "Stop"
$pfx = "${certPath.replace(/\\/g, '\\\\')}"
$pwd = "${password}"

$secPwd = ConvertTo-SecureString -String $pwd -AsPlainText -Force
$col = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
$col.Import($pfx, $pwd, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet)
$thumb = $col[0].Thumbprint
Write-Host "Thumbprint: $thumb"

$userStores = @("Cert:\\CurrentUser\\TrustedPeople", "Cert:\\CurrentUser\\Root")
foreach ($store in $userStores) {
    $existing = Get-ChildItem $store -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq $thumb }
    if (-not $existing) {
        Import-PfxCertificate -FilePath $pfx -CertStoreLocation $store -Password $secPwd | Out-Null
        Write-Host "  Installed in $store"
    } else {
        Write-Host "  Already in $store"
    }
}

$machineStores = @("Cert:\\LocalMachine\\TrustedPeople", "Cert:\\LocalMachine\\Root")
$needsAdmin = $false
foreach ($store in $machineStores) {
    $existing = Get-ChildItem $store -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq $thumb }
    if (-not $existing) { $needsAdmin = $true; break }
}

if ($needsAdmin) {
    Write-Host "  Installing in LocalMachine stores (requires elevation)..."
    $cmd = "Import-PfxCertificate -FilePath '$pfx' -CertStoreLocation Cert:\\LocalMachine\\TrustedPeople -Password (ConvertTo-SecureString -String '$pwd' -AsPlainText -Force); Import-PfxCertificate -FilePath '$pfx' -CertStoreLocation Cert:\\LocalMachine\\Root -Password (ConvertTo-SecureString -String '$pwd' -AsPlainText -Force)"
    Start-Process powershell -Verb RunAs -ArgumentList "-Command", $cmd -Wait
    Write-Host "  Installed in LocalMachine stores"
} else {
    Write-Host "  Already in LocalMachine stores"
}
`
  const tempPs1 = path.join(__dirname, '_install-cert.ps1')
  try {
    fs.writeFileSync(tempPs1, ps1, 'utf8')
    execSync(`powershell -ExecutionPolicy Bypass -File "${tempPs1}"`, { stdio: 'inherit' })
    console.log('--- Certificado instalado com sucesso! ---')
  } catch (err) {
    console.warn('Aviso: Falha ao instalar certificado (pode precisar de admin):', err.message)
  } finally {
    if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1)
  }
}

main().catch((err) => {
  console.error('Erro fatal no sign-appx:', err.message)
  process.exit(1)
})
