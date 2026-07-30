<#
.SYNOPSIS
Switches the active GitHub CLI account and keeps Git plus the Codex GitHub MCP aligned.

.DESCRIPTION
Uses GitHub CLI's secure credential store. After login or account selection, the script:
1. configures Git to authenticate through GitHub CLI;
2. copies the active token into the user-scoped GITHUB_PAT_TOKEN environment variable;
3. verifies access to the requested repository without printing the token.

Restart Codex after switching so its GitHub MCP process receives the updated environment.

.EXAMPLE
.\scripts\github-account-switcher.ps1 -Login

.EXAMPLE
.\scripts\github-account-switcher.ps1 -User authorised-account

.EXAMPLE
.\scripts\github-account-switcher.ps1 -Status
#>
[CmdletBinding()]
param(
  [string]$User,
  [switch]$Login,
  [switch]$Status,
  [string]$Repository = 'adampadobe/AEP-Orchestration-Lab'
)

$ErrorActionPreference = 'Stop'
$githubHost = 'github.com'
$tokenVariable = 'GITHUB_MCP_TOKEN'

function Get-GhCommand {
  $command = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $command) {
    throw 'GitHub CLI (gh) is not installed or is not available on PATH.'
  }
  return $command.Source
}

function Invoke-Gh {
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,
    [switch]$AllowFailure
  )

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $script:ghPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "gh $($Arguments -join ' ') failed:`n$($output -join [Environment]::NewLine)"
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = @($output)
  }
}

function Get-AuthenticatedAccounts {
  $result = Invoke-Gh -Arguments @('auth', 'status', '--hostname', $githubHost, '--json', 'hosts') -AllowFailure
  if (-not $result.Output) {
    return @()
  }

  try {
    $payload = ($result.Output -join [Environment]::NewLine) | ConvertFrom-Json
  } catch {
    return @()
  }

  $accounts = @($payload.hosts.$githubHost)
  return @($accounts | Where-Object { $_.state -eq 'success' })
}

function Select-Account {
  param([array]$Accounts)

  if ($Accounts.Count -eq 0) {
    throw 'No valid GitHub accounts are available. Run this script with -Login first.'
  }
  if ($Accounts.Count -eq 1) {
    return [string]$Accounts[0].login
  }

  Write-Host 'Authenticated GitHub accounts:'
  for ($index = 0; $index -lt $Accounts.Count; $index++) {
    $activeMarker = if ($Accounts[$index].active) { ' (active)' } else { '' }
    Write-Host "  $($index + 1). $($Accounts[$index].login)$activeMarker"
  }

  $selection = Read-Host 'Choose an account number'
  $number = 0
  if (-not [int]::TryParse($selection, [ref]$number) -or $number -lt 1 -or $number -gt $Accounts.Count) {
    throw 'Invalid account selection.'
  }
  return [string]$Accounts[$number - 1].login
}

$script:ghPath = Get-GhCommand

if ($Status) {
  & $script:ghPath auth status --hostname $githubHost
  exit $LASTEXITCODE
}

if ($Login) {
  Write-Host 'Opening GitHub authentication in your browser...'
  Invoke-Gh -Arguments @(
    'auth', 'login',
    '--hostname', $githubHost,
    '--git-protocol', 'https',
    '--web'
  ) | Out-Null
} else {
  $accounts = Get-AuthenticatedAccounts
  $targetUser = if ($User) { $User } else { Select-Account -Accounts $accounts }
  Invoke-Gh -Arguments @(
    'auth', 'switch',
    '--hostname', $githubHost,
    '--user', $targetUser
  ) | Out-Null
}

Invoke-Gh -Arguments @('auth', 'setup-git', '--hostname', $githubHost) | Out-Null

$activeAccount = @(Get-AuthenticatedAccounts | Where-Object { $_.active } | Select-Object -First 1)
$activeUser = if ($activeAccount.Count) { [string]$activeAccount[0].login } else { '' }
if (-not $activeUser) {
  throw 'GitHub authentication succeeded, but the active account could not be resolved.'
}

$tokenResult = Invoke-Gh -Arguments @('auth', 'token', '--hostname', $githubHost, '--user', $activeUser)
$token = ($tokenResult.Output -join '').Trim()
if (-not $token) {
  throw "No token is available for GitHub account '$activeUser'."
}

[Environment]::SetEnvironmentVariable($tokenVariable, $token, 'User')
Set-Item -Path "Env:$tokenVariable" -Value $token
$token = $null

$permissionResult = Invoke-Gh -Arguments @(
  'api',
  "repos/$Repository",
  '--jq',
  '"repository=" + .full_name + ", pull=" + (.permissions.pull|tostring) + ", push=" + (.permissions.push|tostring)'
) -AllowFailure

Write-Host "Active GitHub account: $activeUser"
Write-Host "Codex MCP credential: $tokenVariable updated for the current user (token not displayed)."
if ($permissionResult.ExitCode -eq 0) {
  Write-Host ($permissionResult.Output -join [Environment]::NewLine)
} else {
  Write-Warning "The active account could not access '$Repository'."
}
Write-Host 'Restart Codex before using the GitHub MCP so it receives the updated credential.'
