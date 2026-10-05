param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$TestRoot, [string]$ExpectedExecutable)
$ErrorActionPreference = 'Stop'
if (!$IsWindows) { throw 'Windows installer test only' }
$package = (Resolve-Path -LiteralPath $Installer).Path
$scratch = [IO.Path]::GetFullPath($TestRoot)
if (![IO.Path]::IsPathFullyQualified($TestRoot) -or (Test-Path -LiteralPath $scratch)) { throw 'Use a new absolute scratch directory' }
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
function Get-GitvizRegistration { @(Get-ChildItem -LiteralPath $registry -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'gitviz' }) }
if ((Get-GitvizRegistration).Count -ne 0) { throw 'Existing gitviz installation detected; refusing to replace it' }
if (Get-NetTCPConnection -LocalPort 9347 -State Listen -ErrorAction SilentlyContinue) { throw 'CDP port already in use' }
New-Item -ItemType Directory -Path $scratch | Out-Null
$destination = [IO.Path]::GetFullPath((Join-Path $scratch 'installed app'))
if (!$destination.StartsWith($scratch + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installation escaped scratch' }
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9347'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $scratch 'webview'
$env:GITVIZ_INSTALL_TEST_ROOT = $scratch
$env:TEMP = $scratch
$env:TMP = $scratch
$application = $null
$uninstaller = $null
try {
  foreach ($phase in @('first', 'reinstall')) {
    $setup = Start-Process -FilePath $package -ArgumentList "/S /D=$destination" -WindowStyle Hidden -PassThru -Wait
    if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
    $executable = Join-Path $destination 'gitviz.exe'
    if (!(Test-Path -LiteralPath $executable)) { throw 'Installed executable missing' }
    $registration = Get-GitvizRegistration
    if ($registration.Count -ne 1) { throw 'Expected one uninstall registration' }
    $expectedVersion = (Get-Content -Raw (Join-Path $PSScriptRoot '../package.json') | ConvertFrom-Json).version
    if ($registration[0].DisplayVersion -ne $expectedVersion) { throw 'Installed version does not match source' }
    $rawUninstall = $registration[0].UninstallString
    $candidate = if ($rawUninstall -match '^"([^"]+\.exe)"') { $Matches[1] } elseif ($rawUninstall -match '^(.+\.exe)$') { $Matches[1] } else { throw 'Unrecognized uninstall command' }
    $candidate = [IO.Path]::GetFullPath($candidate)
    if (!$candidate.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Uninstaller escaped test installation' }
    $uninstaller = $candidate
    if ($ExpectedExecutable) {
      $comparison = & node (Join-Path $PSScriptRoot 'check-installed-binary.mjs') $ExpectedExecutable $executable
      if ($LASTEXITCODE -ne 0) { throw 'Installed executable failed the Tauri NSIS byte comparison' }
      $comparison | Set-Content -LiteralPath (Join-Path $scratch "installed-binary-$phase.json")
    }
    $env:GITVIZ_INSTALL_TEST_PHASE = $phase
    $application = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
    & node (Join-Path $PSScriptRoot '../tests/installed-desktop-smoke.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Installed UI smoke failed: $phase" }
    $application.Refresh()
    if (!$application.CloseMainWindow()) { throw 'Could not request normal window close' }
    if (!$application.WaitForExit(15000)) { throw 'Installed application did not close normally' }
    $application = $null
  }
} finally {
  if ($application -and !$application.HasExited) {
    if ($application.Path -eq (Join-Path $destination 'gitviz.exe')) { Stop-Process -Id $application.Id -Force }
  }
  if ($uninstaller -and (Test-Path -LiteralPath $uninstaller)) {
    # /D is not an uninstall option; _?= keeps NSIS in the verified installation directory.
    $remove = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$destination" -WindowStyle Hidden -PassThru -Wait
    if ($remove.ExitCode -ne 0) { throw "Uninstaller failed: $($remove.ExitCode)" }
  }
}
if ((Get-GitvizRegistration).Count -ne 0 -or (Test-Path -LiteralPath (Join-Path $destination 'gitviz.exe'))) { throw 'Uninstall left application or registration behind' }
if (!(Test-Path -LiteralPath (Join-Path $scratch 'repo/.git')) -or !(Test-Path -LiteralPath $env:WEBVIEW2_USER_DATA_FOLDER)) { throw 'Uninstall removed repository or WebView test data' }
@{ firstInstall = $true; sameVersionReinstall = $true; crossVersionUpgrade = 'not tested'; uninstall = $true; version = $expectedVersion; repositoryAndWebViewPreserved = $true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $scratch 'installer-result.json')
Write-Output 'PASS installer: first install, native launch, same-version reinstall, data retention, uninstall'
