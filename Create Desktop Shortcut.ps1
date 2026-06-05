$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $projectDir "Start Universal Audio Overlay.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "💿 Universal Audio Overlay.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = "Universal Audio Overlay"

# Uses a built-in Windows media/disc-style icon for the desktop shortcut.
$shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,184"
$shortcut.Save()

Write-Host "Created desktop shortcut:"
Write-Host $shortcutPath
