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
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr handle);
  public static IntPtr FindMainWindow(uint pid) {
    IntPtr result = IntPtr.Zero;
    int matches = 0;
    EnumWindows((handle, param) => {
      uint owner; GetWindowThreadProcessId(handle, out owner);
      var name = new StringBuilder(256); GetClassName(handle, name, name.Capacity);
      if (owner == pid && name.ToString() == "Tauri Window" && IsWindowVisible(handle)) {
        result = handle; matches++;
      }
      return true;
    }, IntPtr.Zero);
    if (matches != 1) throw new InvalidOperationException("Expected exactly one visible Tauri test window.");
    return result;
  }
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
# Process.MainWindowHandle can select Tao's visible internal event-target window.
$mainWindowHandle = [GitvizCloseTest]::FindMainWindow([uint32]$AppProcessId)
if (-not [GitvizCloseTest]::PostMessageW($mainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
  throw 'WM_CLOSE could not be posted to the test window.'
}
