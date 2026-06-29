$prs = @(44, 47, 56, 57, 58, 59, 60, 61, 65, 140, 148, 149)
foreach ($pr in $prs) {
    $info = gh pr view $pr --json number,title,mergeable,mergeStateStatus,additions,deletions,changedFiles,headRefName 2>&1 | ConvertFrom-Json
    Write-Host "=== #$($info.number) $($info.title) ==="
    Write-Host "  mergeable=$($info.mergeable) mergeState=$($info.mergeStateStatus)"
    Write-Host "  +$($info.additions)/-$($info.deletions) files=$($info.changedFiles) head=$($info.headRefName)"
    Write-Host ""
}
