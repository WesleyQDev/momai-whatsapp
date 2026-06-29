$prs = @(47, 56, 57, 58, 59, 60, 61, 65)
foreach ($pr in $prs) {
    $info = gh pr view $pr --json headRefName 2>&1 | ConvertFrom-Json
    Write-Host "$pr : $($info.headRefName)"
}
