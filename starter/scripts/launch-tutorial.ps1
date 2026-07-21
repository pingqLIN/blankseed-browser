[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 4173,

  [ValidatePattern('^[a-z][a-z0-9-]{0,39}$')]
  [string]$Scenario = 'overview',

  [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$starterRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'serve-tutorial.mjs'))
$stateRoot = Join-Path $starterRoot 'workspace\state\tutorial-launcher'
$pidFile = Join-Path $stateRoot ("server-{0}.pid" -f $Port)
$stdoutLog = Join-Path $stateRoot ("server-{0}.stdout.log" -f $Port)
$stderrLog = Join-Path $stateRoot ("server-{0}.stderr.log" -f $Port)
$healthUrl = "http://127.0.0.1:$Port/__blankseed_tutorial_health"
$tutorialUrl = "http://127.0.0.1:$Port/tutorial/?scenario=$([uri]::EscapeDataString($Scenario))"

function Test-BlankSeedTutorialHealth {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
    if ($response.StatusCode -ne 200) { return $false }
    $payload = $response.Content | ConvertFrom-Json
    return $payload.status -eq 'ok' -and $payload.service -eq 'blankseed-tutorial'
  } catch {
    return $false
  }
}

function Open-TutorialBrowser {
  if ($NoBrowser) { return }
  Start-Process -FilePath $tutorialUrl | Out-Null
}

if (Test-BlankSeedTutorialHealth) {
  Write-Host "BlankSeed 操作教學已在本機執行：$tutorialUrl"
  Open-TutorialBrowser
  exit 0
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force
}

$previousPort = $env:BLANKSEED_TUTORIAL_PORT
$serverProcess = $null
try {
  $env:BLANKSEED_TUTORIAL_PORT = [string]$Port
  $serverProcess = Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList ('"{0}"' -f $serverScript) `
    -WorkingDirectory $starterRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru
} finally {
  if ($null -eq $previousPort) {
    Remove-Item Env:BLANKSEED_TUTORIAL_PORT -ErrorAction SilentlyContinue
  } else {
    $env:BLANKSEED_TUTORIAL_PORT = $previousPort
  }
}

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (Test-BlankSeedTutorialHealth) {
      $ready = $true
      break
    }
    if ($serverProcess.HasExited) { break }
    Start-Sleep -Milliseconds 200
  }

  if (-not $ready) {
    $detail = if (Test-Path -LiteralPath $stderrLog) {
      (Get-Content -LiteralPath $stderrLog -Raw -ErrorAction SilentlyContinue).Trim()
    } else {
      ''
    }
    if (-not $serverProcess.HasExited) {
      Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($detail) {
      throw "無法啟動 BlankSeed 操作教學：$detail"
    }
    throw "無法啟動 BlankSeed 操作教學；連接埠 $Port 可能已由其他程式使用。"
  }

  Set-Content -LiteralPath $pidFile -Value $serverProcess.Id -Encoding ascii
  Write-Host "BlankSeed 操作教學已就緒：$tutorialUrl"
  Write-Host "伺服器 PID：$($serverProcess.Id)"
  Open-TutorialBrowser
} catch {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  throw
}
