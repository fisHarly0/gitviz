param(
  [Parameter(Mandatory=$true)][ValidateSet('deny','restore')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Fixture,
  [Parameter(Mandatory=$true)][string]$Scratch,
  [Parameter(Mandatory=$true)][string]$Backup
)
$ErrorActionPreference='Stop'
$scratchPath=[IO.Path]::GetFullPath($Scratch).TrimEnd('\')+'\'
$fixturePath=[IO.Path]::GetFullPath($Fixture)
$backupPath=[IO.Path]::GetFullPath($Backup)
if (!$fixturePath.StartsWith($scratchPath,[StringComparison]::OrdinalIgnoreCase) -or !$backupPath.StartsWith($scratchPath,[StringComparison]::OrdinalIgnoreCase)) { throw 'Only fixtures and backup files inside scratch are allowed' }
$target=Join-Path $fixturePath '.git\refs\heads'
$acl=Get-Acl -LiteralPath $target
if ($Mode -eq 'deny') {
  if (Test-Path -LiteralPath $backupPath) { throw 'ACL backup already exists' }
  [IO.File]::WriteAllText($backupPath,$acl.Sddl)
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'Write','ContainerInherit,ObjectInherit','None','Deny')
  $acl.AddAccessRule($rule)
} else {
  $acl.SetSecurityDescriptorSddlForm([IO.File]::ReadAllText($backupPath))
}
Set-Acl -LiteralPath $target -AclObject $acl
