[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$starterRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stateRoot = Join-Path $starterRoot 'workspace\state\app-launcher'

function Get-BlankSeedElectronProcess {
  $expectedRoot = $starterRoot.ToLowerInvariant()
  return Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      ([string]$_.ExecutablePath).ToLowerInvariant().Contains($expectedRoot) -or
      ([string]$_.CommandLine).ToLowerInvariant().Contains($expectedRoot)
    } |
    Select-Object -First 1
}

$existing = Get-BlankSeedElectronProcess
if ($existing) {
  Write-Host "BlankSeed Browser 已在執行（PID $($existing.ProcessId)）。"
  exit 0
}

$npmCommand = Get-Command npm.cmd -ErrorAction Stop
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $stateRoot "launch-$timestamp.stdout.log"
$stderrLog = Join-Path $stateRoot "launch-$timestamp.stderr.log"

$launcherProcess = Start-Process `
  -FilePath $npmCommand.Source `
  -ArgumentList 'start' `
  -WorkingDirectory $starterRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $electron = Get-BlankSeedElectronProcess
  if ($electron) {
    Write-Host "BlankSeed Browser 已啟動（PID $($electron.ProcessId)）。"
    exit 0
  }
  if ($launcherProcess.HasExited) { break }
  Start-Sleep -Milliseconds 250
}

$detail = if (Test-Path -LiteralPath $stderrLog) {
  (Get-Content -LiteralPath $stderrLog -Raw -ErrorAction SilentlyContinue).Trim()
} else {
  ''
}
if ($detail) {
  throw "BlankSeed Browser 啟動失敗：$detail"
}
throw "BlankSeed Browser 未在預期時間內顯示；請查看 $stdoutLog。"
