$prs = @(44, 47, 56, 57, 58, 59, 60, 61, 65, 140, 148, 149)
foreach ($pr in $prs) {
    Write-Host "=== #$pr ==="
    $checks = gh pr checks $pr 2>&1
    $checks | ForEach-Object {
        $line = $_.ToString()
        if ($line -match "pass|fail|pending|skipping") {
            Write-Host "  $line"
        }
    }
    Write-Host ""
}
