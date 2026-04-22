const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const certPath = path.resolve(__dirname, '../../../momai_certificado.pfx')
const password = 'momai2026'
const publisher = 'CN=DD4A9768-285C-45F0-982B-113F2C63C677'

if (fs.existsSync(certPath)) {
  console.log('--- Certificado de teste encontrado. ---')
  process.exit(0)
}

console.log('--- Certificado de teste nao encontrado. Gerando novo... ---')

if (process.platform !== 'win32') {
  console.error('Erro: A geracao automatica de certificado MSIX requer Windows.')
  process.exit(1)
}

const ps1Content = `
$ErrorActionPreference = "Stop"
$pwd = ConvertTo-SecureString -String "${password}" -Force -AsPlainText
$cert = New-SelfSignedCertificate \`
  -Type Custom \`
  -Subject "${publisher}" \`
  -KeyUsage DigitalSignature \`
  -FriendlyName "MomAI Test Cert" \`
  -CertStoreLocation "Cert:\\CurrentUser\\My" \`
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
Export-PfxCertificate -Cert $cert -FilePath "${certPath.replace(/\\/g, '\\\\')}" -Password $pwd | Out-Null
Remove-Item -Path "Cert:\\CurrentUser\\My\\$($cert.Thumbprint)"
Write-Host "Certificado gerado com sucesso."
`

const tempPs1 = path.join(__dirname, '_gen-cert.ps1')

try {
  fs.writeFileSync(tempPs1, ps1Content, 'utf8')
  execSync(`powershell -ExecutionPolicy Bypass -File "${tempPs1}"`, { stdio: 'inherit' })
  console.log('--- Certificado salvo em: ' + certPath + ' ---')
} catch (err) {
  console.error('Falha ao gerar certificado:', err.message)
  process.exit(1)
} finally {
  if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1)
}
