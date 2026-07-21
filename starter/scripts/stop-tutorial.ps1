[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 4173
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$starterRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'serve-tutorial.mjs'))
$stateRoot = Join-Path $starterRoot 'workspace\state\tutorial-launcher'
$pidFile = Join-Path $stateRoot ("server-{0}.pid" -f $Port)

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "找不到由快捷啟動器管理的教學伺服器（連接埠 $Port）。"
  exit 0
}

$rawPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
$serverPid = 0
if (-not [int]::TryParse($rawPid, [ref]$serverPid) -or $serverPid -le 0) {
  throw "教學伺服器 PID 檔案無效：$pidFile"
}

$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($null -eq $process) {
  Remove-Item -LiteralPath $pidFile -Force
  Write-Host '教學伺服器已停止；已清除過期的 PID 記錄。'
  exit 0
}

$processRecord = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
$commandLine = [string]$processRecord.CommandLine
$expectedScript = $serverScript.ToLowerInvariant()
$actualCommand = $commandLine.ToLowerInvariant()
if ($process.ProcessName -ne 'node' -or -not $actualCommand.Contains($expectedScript)) {
  throw "PID $serverPid 不是這個工作區的 BlankSeed 教學伺服器；已拒絕停止。"
}

Stop-Process -Id $serverPid
Wait-Process -Id $serverPid -Timeout 5 -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $pidFile -Force
Write-Host "BlankSeed 操作教學伺服器已停止（PID $serverPid）。"
