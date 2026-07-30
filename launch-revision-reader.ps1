$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appUrl = "http://localhost:3000/"
$workDir = Join-Path $projectRoot "work"
$stdoutLog = Join-Path $workDir "shortcut-dev.out.log"
$stderrLog = Join-Path $workDir "shortcut-dev.err.log"

function Test-RevisionReader {
  try {
    $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "Revision Reader"
  } catch {
    return $false
  }
}

if (-not (Test-RevisionReader)) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "App dependencies are missing. Run npm install in the project folder first.",
      "Revision Reader",
      "OK",
      "Information"
    ) | Out-Null
    exit 1
  }

  if (-not (Test-Path -LiteralPath $workDir)) {
    New-Item -ItemType Directory -Path $workDir | Out-Null
  }

  Start-Process `
    -FilePath "npx.cmd" `
    -ArgumentList @("vinext", "dev", "--hostname", "0.0.0.0", "--port", "3000") `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-RevisionReader) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "The app could not start. Check the launcher logs in the work folder.",
      "Revision Reader",
      "OK",
      "Error"
    ) | Out-Null
    exit 1
  }
}

Start-Process -FilePath (Join-Path $env:WINDIR "explorer.exe") -ArgumentList $appUrl
