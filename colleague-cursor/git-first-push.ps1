# Run this script from PowerShell in this folder to connect to GitHub and push.
# Uses Git from PATH or from common install locations if not in PATH.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Checking Git..." -ForegroundColor Cyan
$gitExe = $null
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitExe = $gitCmd.Source
} else {
    $paths = @(
        "$env:ProgramFiles\Git\bin\git.exe",
        "${env:ProgramFiles(x86)}\Git\bin\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\bin\git.exe"
    )
    foreach ($p in $paths) {
        if ($p -and (Test-Path $p)) { $gitExe = $p; break }
    }
}
if (-not $gitExe) {
    Write-Host "ERROR: Git not found." -ForegroundColor Red
    Write-Host "Install Git, then run this script again:" -ForegroundColor Yellow
    Write-Host "  winget install Git.Git" -ForegroundColor White
    Write-Host "  Or download: https://git-scm.com/download/win" -ForegroundColor White
    Write-Host "After installing, close and reopen PowerShell, then run: .\git-first-push.ps1" -ForegroundColor Yellow
    exit 1
}
# Ensure git is on PATH for this session (in case we used a full path)
$gitDir = Split-Path $gitExe -Parent
if ($env:PATH -notlike "*$gitDir*") { $env:PATH = "$gitDir;$env:PATH" }
Write-Host "Using Git: $gitExe" -ForegroundColor Green

if (-not (Test-Path .git)) {
    Write-Host "Initializing repository..." -ForegroundColor Cyan
    git init
}

# Check for origin without failing when it doesn't exist
$remotes = @(git remote 2>$null)
if ($remotes -notcontains "origin") {
    Write-Host "Adding remote origin (SSH)..." -ForegroundColor Cyan
    git remote add origin git@github.com:kirkside-bit/cursor.git
} else {
    $remote = git remote get-url origin 2>$null
    if ($remote -notmatch "git@github.com") {
        Write-Host "Switching remote to SSH..." -ForegroundColor Cyan
        git remote set-url origin git@github.com:kirkside-bit/cursor.git
    } else {
        Write-Host "Remote already set to SSH." -ForegroundColor Green
    }
}

Write-Host "Adding all files..." -ForegroundColor Cyan
git add .

Write-Host "Committing..." -ForegroundColor Cyan
git commit -m "Initial backup: AEP Profile Viewer, Consent, Ingest Events, Adobe Auth" 2>$null
if ($LASTEXITCODE -ne 0) {
    # Maybe nothing to commit or already committed
    git status
}

Write-Host "Setting branch to main..." -ForegroundColor Cyan
git branch -M main

# If remote has commits we don't have (e.g. README created on GitHub), pull first
Write-Host "Fetching from GitHub..." -ForegroundColor Cyan
git fetch origin main 2>$null
if ($LASTEXITCODE -eq 0) {
    $base = git merge-base main origin/main 2>$null
    if (-not $base) {
        Write-Host "Merging remote content (e.g. README) with local..." -ForegroundColor Cyan
        git pull origin main --allow-unrelated-histories --no-edit
    }
}

Write-Host "Pushing to GitHub (SSH)..." -ForegroundColor Cyan
git push -u origin main

Write-Host "Done." -ForegroundColor Green
