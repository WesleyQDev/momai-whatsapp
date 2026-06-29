$prs = @(44, 47, 56, 57, 58, 59, 60, 61, 65, 149)
foreach ($pr in $prs) {
    Write-Host "=== #$pr ==="
    $info = gh pr view $pr --json title,labels,closingIssuesReferences 2>&1 | ConvertFrom-Json
    $labelNames = ($info.labels | ForEach-Object { $_.name }) -join ", "
    if ([string]::IsNullOrEmpty($labelNames)) { $labelNames = "(none)" }
    $issues = ($info.closingIssuesReferences | ForEach-Object { $_.number }) -join ", "
    if ([string]::IsNullOrEmpty($issues)) { $issues = "(none)" }
    Write-Host "  Title: $($info.title)"
    Write-Host "  Labels: $labelNames"
    Write-Host "  Closes: $issues"
    Write-Host ""
}
