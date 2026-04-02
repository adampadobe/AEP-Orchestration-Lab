# One-time: pull remote (e.g. README) and push. Run from this folder.
Set-Location $PSScriptRoot
git pull origin main --allow-unrelated-histories --no-edit
git push -u origin main
Write-Host "Done." -ForegroundColor Green
