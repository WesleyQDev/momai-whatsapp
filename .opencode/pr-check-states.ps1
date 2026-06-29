$prs = @(47, 56, 57, 58, 59, 60, 61, 65)
foreach ($pr in $prs) {
    Write-Host "=== #$pr ==="
    $info = gh pr view $pr --json state,mergeable,statusCheckRollup 2>&1 | ConvertFrom-Json
    $checkStates = $info.statusCheckRollup | ForEach-Object {
        $state = $_.state
        $conclusion = $_.conclusion
        $name = $_.name
        "$name=$conclusion"
    }
    Write-Host "  state=$($info.state) mergeable=$($info.mergeable)"
    $checkStates | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
}
