param(
  [Parameter(Mandatory=$true)][int]$AppProcessId,
  [Parameter(Mandatory=$true)][string]$ExpectedExecutable,
  [switch]$CancelFileDialog
)
$ErrorActionPreference = 'Stop'
$appProcess = Get-Process -Id $AppProcessId
if ($appProcess.Path -ne (Resolve-Path -LiteralPath $ExpectedExecutable).Path) {
  throw 'Refusing to close a process outside the test executable.'
}
$appProcess.Refresh()
if ($appProcess.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Test application has no main window.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class GitvizCloseTest {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool PostMessageW(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam);
  private delegate bool EnumWindowProc(IntPtr handle, IntPtr param);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr param);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr handle, StringBuilder name, int capacity);
  public static IntPtr FindFileDialog(uint pid) {
    IntPtr result = IntPtr.Zero;
    EnumWindows((handle, param) => {
      uint owner; GetWindowThreadProcessId(handle, out owner);
      var name = new StringBuilder(256); GetClassName(handle, name, name.Capacity);
      if (owner == pid && name.ToString() == "#32770") { result = handle; return false; }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@
if ($CancelFileDialog) {
  $dialogHandle = [GitvizCloseTest]::FindFileDialog($AppProcessId)
  if ($dialogHandle -eq [IntPtr]::Zero) { throw 'No native file dialog belongs to the test process.' }
  if (-not [GitvizCloseTest]::PostMessageW($dialogHandle, 0x0111, [IntPtr]2, [IntPtr]::Zero)) { throw 'Cannot cancel test file dialog.' }
  exit 0
}
if (-not [GitvizCloseTest]::PostMessageW($appProcess.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
  throw 'WM_CLOSE could not be posted to the test window.'
}
