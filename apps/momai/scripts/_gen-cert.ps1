
$ErrorActionPreference = "Stop"
$pwd = ConvertTo-SecureString -String "momai2026" -Force -AsPlainText
$cert = New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=DD4A9768-285C-45F0-982B-113F2C63C677" `
  -KeyUsage DigitalSignature `
  -FriendlyName "MomAI Test Cert" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
Export-PfxCertificate -Cert $cert -FilePath "C:\\Users\\wesle\\dev\\momai\\momai_certificado.pfx" -Password $pwd | Out-Null
Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)"
Write-Host "Certificado gerado com sucesso."
