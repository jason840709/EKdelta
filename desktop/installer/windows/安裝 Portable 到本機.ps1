$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$Source=(Resolve-Path $PSScriptRoot).Path
$Target=Join-Path $env:LOCALAPPDATA 'Programs\EKdelta Desktop'
if((Resolve-Path $Source).Path -eq $Target){Write-Host '已經位於安裝位置。';Start-Process '.\EKdelta Desktop.exe';exit 0}
Write-Host "安裝到：$Target"
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Get-ChildItem $Target -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Source '*') $Target -Recurse -Force
$ws=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('Desktop')
$start=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
foreach($link in @((Join-Path $desktop 'EKdelta.lnk'),(Join-Path $start 'EKdelta.lnk'))){$sc=$ws.CreateShortcut($link);$sc.TargetPath=Join-Path $Target 'EKdelta Desktop.exe';$sc.WorkingDirectory=$Target;$ico=Join-Path $Target 'EKdelta.ico';if(Test-Path $ico){$sc.IconLocation=$ico};$sc.Save()}
Write-Host '✅ EKdelta 已安裝並建立桌面／開始功能表捷徑。'
Start-Process (Join-Path $Target 'EKdelta Desktop.exe')
