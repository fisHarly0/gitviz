param(
  [Parameter(Mandatory)][int]$AppProcessId,
  [Parameter(Mandatory)][string]$ExpectedExecutable,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [switch]$IncludeDump
)
$ErrorActionPreference = 'Stop'
$application = Get-Process -Id $AppProcessId
$expected = (Resolve-Path -LiteralPath $ExpectedExecutable).Path
if ($application.Path -ne $expected) { throw 'Refusing to inspect a process outside the test executable.' }
if (![IO.Path]::IsPathFullyQualified($OutputDirectory)) { throw 'Use an absolute fixture evidence directory.' }
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'Diagnostic directory must not already exist.' }
New-Item -ItemType Directory -Path $destination | Out-Null
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class GitvizStartupCapture {
  private delegate bool EnumWindowProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("dbghelp.dll", SetLastError=true)]
  public static extern bool MiniDumpWriteDump(IntPtr process, uint pid, IntPtr file, uint type, IntPtr exception, IntPtr streams, IntPtr callback);
  public static string[] Windows(uint pid) {
    var list = new List<string>();
    EnumWindows((window, parameter) => {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (owner == pid) {
        var name = new StringBuilder(256); GetClassName(window, name, name.Capacity);
        list.Add(window + " | " + name + " | visible=" + IsWindowVisible(window));
      }
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@
$snapshot = @{
  pid = $application.Id
  executable = $expected
  capturedAt = [DateTime]::UtcNow.ToString('o')
  processStartedAt = $application.StartTime.ToUniversalTime().ToString('o')
  cpuSeconds = $application.CPU
  windows = [GitvizStartupCapture]::Windows($AppProcessId)
  threads = @($application.Threads | ForEach-Object {
    $thread = $_
    @{ id = $thread.Id; state = $thread.ThreadState.ToString(); wait = if ($thread.ThreadState -eq 'Wait') { $thread.WaitReason.ToString() } else { $null } }
  })
  modules = @($application.Modules | ForEach-Object { @{ name = $_.ModuleName; base = $_.BaseAddress.ToInt64(); bytes = $_.ModuleMemorySize } })
}
$snapshot | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'process.json')
if ($IncludeDump) {
  # Only the explicitly identified isolated test process; never auto-upload dumps.
  # Microsoft recommends collecting from another process to avoid loader deadlocks.
  $file = [IO.File]::Open((Join-Path $destination 'startup.dmp'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    if (![GitvizStartupCapture]::MiniDumpWriteDump($application.Handle, $application.Id, $file.SafeFileHandle.DangerousGetHandle(), 0, [IntPtr]::Zero, [IntPtr]::Zero, [IntPtr]::Zero)) {
      throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
    }
  } finally { $file.Dispose() }
}
