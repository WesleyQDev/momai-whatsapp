param(
    [string]$Password = "SuaSenhaForte"
)

$ErrorActionPreference = "Stop"

$root       = Resolve-Path "$PSScriptRoot\..\..\.."
$pfx        = "$root\momai_certificado.pfx"
$appx       = "$root\apps\momai\dist\MomAI-Installer.appx"
$signTool   = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"

if (-not (Test-Path $pfx))   { throw "PFX not found: $pfx" }
if (-not (Test-Path $appx))  { throw "APPX not found: $appx" }

Write-Host "`n[1/3] Signing APPX..." -ForegroundColor Cyan
& $signTool sign /fd SHA256 /f $pfx /p $Password /v $appx
if ($LASTEXITCODE -ne 0) { throw "signtool failed with exit code $LASTEXITCODE" }

$secPwd = ConvertTo-SecureString -String $Password -AsPlainText -Force
$pfxCol = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
$pfxCol.Import($pfx, $Password, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet)
$thumb  = $pfxCol[0].Thumbprint

$stores = @("Cert:\CurrentUser\TrustedPeople", "Cert:\CurrentUser\Root")
Write-Host "`n[2/3] Installing cert (CurrentUser)..." -ForegroundColor Cyan
foreach ($store in $stores) {
    if (-not (Get-ChildItem $store | Where-Object { $_.Thumbprint -eq $thumb })) {
        Import-PfxCertificate -FilePath $pfx -CertStoreLocation $store -Password $secPwd | Out-Null
        Write-Host "  Installed in $store"
    } else {
        Write-Host "  Already in $store"
    }
}

Write-Host "`n[3/3] Installing cert (LocalMachine - requires admin)..." -ForegroundColor Cyan
$machineStores = @("Cert:\LocalMachine\TrustedPeople", "Cert:\LocalMachine\Root")
$needsAdmin = $false
foreach ($store in $machineStores) {
    if (-not (Get-ChildItem $store | Where-Object { $_.Thumbprint -eq $thumb })) {
        $needsAdmin = $true
        break
    }
}

if ($needsAdmin) {
    $cmd = "Import-PfxCertificate -FilePath '$pfx' -CertStoreLocation Cert:\LocalMachine\TrustedPeople -Password (ConvertTo-SecureString -String '$Password' -AsPlainText -Force); Import-PfxCertificate -FilePath '$pfx' -CertStoreLocation Cert:\LocalMachine\Root -Password (ConvertTo-SecureString -String '$Password' -AsPlainText -Force)"
    Start-Process powershell -Verb RunAs -ArgumentList "-Command", $cmd -Wait
    Write-Host "  Installed in LocalMachine stores"
} else {
    Write-Host "  Already in LocalMachine stores"
}

Write-Host "`nDone! APPX signed and certs installed." -ForegroundColor Green
Write-Host "Thumbprint: $thumb"
