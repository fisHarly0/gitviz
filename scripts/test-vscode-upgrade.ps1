param(
  [Parameter(Mandatory)][string]$OldVsix,
  [Parameter(Mandatory)][string]$NewVsix,
  [Parameter(Mandatory)][string]$TestRoot,
  [Parameter(Mandatory)][string]$PlaywrightCorePath,
  [string]$CodeCli = (Get-Command code.cmd -ErrorAction Stop).Source
)
$ErrorActionPreference = 'Stop'
if (!$IsWindows) { throw 'This native host driver is validated on Windows only' }
$root = [IO.Path]::GetFullPath($TestRoot)
if (![IO.Path]::IsPathFullyQualified($TestRoot) -or (Test-Path -LiteralPath $root)) { throw 'Use a new absolute scratch directory' }
if (Get-NetTCPConnection -LocalPort 9235 -State Listen -ErrorAction SilentlyContinue) { throw 'Test CDP port already occupied' }
$cli = (Resolve-Path -LiteralPath $CodeCli).Path
$code = Join-Path (Split-Path (Split-Path $cli -Parent) -Parent) 'Code.exe'
if (!(Test-Path -LiteralPath $code)) { throw 'Cannot locate Code.exe beside the supplied CLI' }
$test = Join-Path $PSScriptRoot '../tests/vscode-upgrade-smoke.cjs'
$variables = @{
  GITVIZ_UPGRADE_TEST_ROOT = $root
  GITVIZ_OLD_VSIX = (Resolve-Path -LiteralPath $OldVsix).Path
  GITVIZ_NEW_VSIX = (Resolve-Path -LiteralPath $NewVsix).Path
  PLAYWRIGHT_CORE_PATH = (Resolve-Path -LiteralPath $PlaywrightCorePath).Path
  GITVIZ_CDP_URL = 'http://127.0.0.1:9235'
  GITVIZ_UPGRADE_PHASE = ''
  TEMP = $root
  TMP = $root
}
$previous = @{}
foreach ($name in $variables.Keys) {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process')
}
try {
  & node $test setup
  if ($LASTEXITCODE -ne 0) { throw 'Isolated upgrade fixture creation failed' }
  $fixture = Get-Content -LiteralPath (Join-Path $root 'fixture.json') -Raw | ConvertFrom-Json
  foreach ($phase in @('old', 'upgraded', 'restarted')) {
    if (Get-NetTCPConnection -LocalPort 9235 -State Listen -ErrorAction SilentlyContinue) { throw 'Test CDP port is still occupied' }
    if ($phase -ne 'restarted') {
      $package = if ($phase -eq 'old') { $env:GITVIZ_OLD_VSIX } else { $env:GITVIZ_NEW_VSIX }
      & $cli --user-data-dir "$root/profile" --extensions-dir "$root/extensions" --install-extension $package --force
      if ($LASTEXITCODE -ne 0) { throw 'VSIX installation failed' }
    }
    $env:GITVIZ_UPGRADE_PHASE = $phase
    $arguments = @("--user-data-dir=`"$root/profile`"", "--extensions-dir=`"$root/extensions`"", '--remote-debugging-port=9235', '--new-window', '--skip-welcome', '--skip-release-notes', "`"$($fixture.root)`"")
    $application = Start-Process -FilePath $code -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput "$root/code-$phase.log" -RedirectStandardError "$root/code-$phase.err"
    try {
      $ready = $false
      for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
          $pages = Invoke-RestMethod -Uri 'http://127.0.0.1:9235/json/list' -TimeoutSec 2
          if (@($pages | Where-Object url -Like 'vscode-file:*').Count) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
      }
      if (!$ready) { throw 'VS Code workbench did not start' }
      & node $test $phase
      if ($LASTEXITCODE -ne 0) { throw "UI upgrade phase failed: $phase" }
      if (!$application.WaitForExit(15000)) { throw 'VS Code did not exit after normal quit' }
    } finally {
      if (!$application.HasExited -and $application.Path -eq $code) { Stop-Process -Id $application.Id -Force }
    }
  }
  Write-Output 'PASS VS Code 0.2.0 -> 0.3.0 upgrade and restart recovery'
} finally {
  foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
