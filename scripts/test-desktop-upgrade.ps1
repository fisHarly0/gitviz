param(
  [Parameter(Mandatory)][string]$OldExecutable,
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$ExpectedInstalledExecutable,
  [Parameter(Mandatory)][string]$TestRoot,
  [Parameter(Mandatory)][string]$PlaywrightCorePath
)
$ErrorActionPreference = 'Stop'
if (!$IsWindows) { throw 'Windows desktop migration only' }
$old = (Resolve-Path -LiteralPath $OldExecutable).Path
$package = (Resolve-Path -LiteralPath $Installer).Path
$reference = (Resolve-Path -LiteralPath $ExpectedInstalledExecutable).Path
$root = [IO.Path]::GetFullPath($TestRoot)
if (![IO.Path]::IsPathFullyQualified($TestRoot) -or (Test-Path -LiteralPath $root)) { throw 'Use a new absolute scratch directory' }
if ((Get-Item -LiteralPath $old).VersionInfo.ProductVersion -ne '0.2.0') { throw 'Expected original 0.2.0 portable program' }
$expectedVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
if ((Get-Item -LiteralPath $reference).VersionInfo.ProductVersion -ne $expectedVersion) { throw 'Reference executable version mismatch' }
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
function Get-GitvizRegistration { @(Get-ChildItem -LiteralPath $registry -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object DisplayName -eq 'gitviz') }
if ((Get-GitvizRegistration).Count) { throw 'Existing Gitviz installation detected; refusing to replace it' }
if (Get-NetTCPConnection -LocalPort 9348 -State Listen -ErrorAction SilentlyContinue) { throw 'Test CDP port occupied' }
New-Item -ItemType Directory -Path $root | Out-Null
$destination = [IO.Path]::GetFullPath((Join-Path $root 'installed app'))
if (!$destination.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Install path escaped scratch' }
$variables = @{
  GITVIZ_DESKTOP_UPGRADE_ROOT = $root
  GITVIZ_CDP_URL = 'http://127.0.0.1:9348'
  PLAYWRIGHT_CORE_PATH = (Resolve-Path -LiteralPath $PlaywrightCorePath).Path
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9348'
  WEBVIEW2_USER_DATA_FOLDER = (Join-Path $root 'webview')
  TEMP = $root
  TMP = $root
}
$previous = @{}
foreach ($name in $variables.Keys) {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process')
}
$test = Join-Path $PSScriptRoot '../tests/desktop-upgrade-smoke.cjs'
$application = $null
$uninstaller = $null
$identity = @{ oldVersion = '0.2.0'; targetVersion = $expectedVersion; oldSHA256 = (Get-FileHash -LiteralPath $old).Hash; installerSHA256 = (Get-FileHash -LiteralPath $package).Hash; newSHA256 = (Get-FileHash -LiteralPath $reference).Hash }
try {
  & node $test setup
  if ($LASTEXITCODE -ne 0) { throw 'Fixture setup failed' }
  foreach ($phase in @('old', 'upgraded', 'restarted')) {
    if ($phase -eq 'upgraded') {
      $setup = Start-Process -FilePath $package -ArgumentList "/S /D=$destination" -WindowStyle Hidden -PassThru -Wait
      if ($setup.ExitCode -ne 0) { throw 'NSIS installation failed' }
      $registration = Get-GitvizRegistration
      if ($registration.Count -ne 1 -or $registration[0].DisplayVersion -ne $expectedVersion) { throw 'Installed version registration mismatch' }
      $raw = $registration[0].UninstallString
      $candidate = if ($raw -match '^"([^"]+\.exe)"') { $Matches[1] } elseif ($raw -match '^(.+\.exe)$') { $Matches[1] } else { throw 'Unrecognized uninstall command' }
      $candidate = [IO.Path]::GetFullPath($candidate)
      if (!$candidate.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Uninstaller escaped scratch installation' }
      $uninstaller = $candidate
      $installed = Join-Path $destination 'gitviz.exe'
      $identity.installedSHA256 = (Get-FileHash -LiteralPath $installed).Hash
      $identity.installedVersion = (Get-Item -LiteralPath $installed).VersionInfo.ProductVersion
      $identity | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'binary-comparison.json')
      $comparison = & node (Join-Path $PSScriptRoot 'check-installed-binary.mjs') $reference $installed
      if ($LASTEXITCODE -ne 0) {
        Copy-Item -LiteralPath $installed -Destination (Join-Path $root 'installed-binary.exe')
        throw 'Installed executable failed the Tauri NSIS byte comparison'
      }
      $identity.binaryComparison = ($comparison -join "`n") | ConvertFrom-Json
      $identity | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'binary-comparison.json')
    }
    $executable = if ($phase -eq 'old') { $old } else { Join-Path $destination 'gitviz.exe' }
    $application = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root "native-$phase.log") -RedirectStandardError (Join-Path $root "native-$phase.err")
    $ready = $false
    $startup = [Diagnostics.Stopwatch]::StartNew()
    while ($startup.Elapsed.TotalSeconds -lt 60 -and !$application.HasExited) {
      try {
        $pages = Invoke-RestMethod -Uri 'http://127.0.0.1:9348/json/list' -TimeoutSec 2
        if (@($pages | Where-Object url -Match 'tauri\.localhost').Count) { $ready = $true; break }
      } catch { }
      Start-Sleep -Milliseconds 500
    }
    @{ phase = $phase; processId = $application.Id; executable = $executable; ready = $ready; exited = $application.HasExited; exitCode = $application.ExitCode; elapsedMs = $startup.ElapsedMilliseconds } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root "startup-$phase.json")
    if (!$ready) {
      if (!$application.HasExited) {
        try {
          & pwsh -NoProfile -File (Join-Path $PSScriptRoot '../tests/helpers/capture-desktop-startup.ps1') -AppProcessId $application.Id -ExpectedExecutable $executable -OutputDirectory (Join-Path $root "startup-$phase-diagnostics") -IncludeDump
          if ($LASTEXITCODE -ne 0) { Write-Warning 'Startup diagnostics failed; retain the startup status and native logs.' }
        } catch { Write-Warning "Startup diagnostics failed: $_" }
      }
      throw "Native WebView did not start: $phase"
    }
    & node $test $phase
    if ($LASTEXITCODE -ne 0) { throw "Desktop migration phase failed: $phase" }
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot '../tests/helpers/request-desktop-close.ps1') -AppProcessId $application.Id -ExpectedExecutable $executable
    if ($LASTEXITCODE -ne 0 -or !$application.WaitForExit(15000)) { throw "Desktop did not close normally: $phase" }
    if ($application.ExitCode -ne 0) { throw "Desktop exited abnormally: $phase ($($application.ExitCode))" }
    $application = $null
  }
} finally {
  try {
    if ($application -and !$application.HasExited -and $application.Path -eq $executable) { Stop-Process -Id $application.Id -Force }
    if ($uninstaller -and (Test-Path -LiteralPath $uninstaller)) {
      $remove = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$destination" -WindowStyle Hidden -PassThru -Wait
      if ($remove.ExitCode -ne 0) { throw 'NSIS uninstall failed' }
    }
  } finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
  }
}
if ((Get-GitvizRegistration).Count -or (Test-Path -LiteralPath (Join-Path $destination 'gitviz.exe'))) { throw 'Application or uninstall registration remains' }
$fixture = Get-Content -LiteralPath (Join-Path $root 'fixture.json') -Raw | ConvertFrom-Json
if (!(Test-Path -LiteralPath (Join-Path $fixture.root '.git')) -or !(Test-Path -LiteralPath (Join-Path $root 'webview'))) { throw 'Uninstall removed external test data' }
if ((Get-FileHash -LiteralPath $old).Hash -ne $identity.oldSHA256) { throw 'Original portable executable changed' }
$identity.sharedIsolatedWebViewProfile = $true
$identity.oldPortableToNewInstaller = $true
$identity.installedRecoveryAcrossRestart = $true
$identity.uninstalledWithExternalDataPreserved = $true
$identity | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'desktop-migration-result.json')
Write-Output 'PASS portable 0.2.0 -> installed desktop, shared profile, 2000 commits, native recovery/restart, uninstall'
