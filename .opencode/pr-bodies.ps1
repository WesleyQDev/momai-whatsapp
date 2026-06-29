$prs = @(44, 47, 56, 57, 58, 59, 60, 61, 65, 149)
foreach ($pr in $prs) {
    Write-Host "=== #$pr ==="
    $body = gh pr view $pr --json title,body 2>&1 | ConvertFrom-Json
    $bodyText = $body.body
    # Get just the description (before the long checklist)
    $shortBody = ($bodyText -split "## ")[0]
    if ($shortBody.Length -gt 500) { $shortBody = $shortBody.Substring(0, 500) + "..." }
    Write-Host "  Title: $($body.title)"
    Write-Host "  Body: $shortBody"
    Write-Host ""
}
