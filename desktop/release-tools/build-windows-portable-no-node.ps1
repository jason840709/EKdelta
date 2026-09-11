$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root
$ElectronVersion='33.4.11'
$AppVersion='1.2.3'
$Asset="electron-v$ElectronVersion-win32-x64.zip"
$Cache=Join-Path $Root '.windows-runtime-cache'
$Tmp=Join-Path $Cache $Asset
$Sums=Join-Path $Cache 'SHASUMS256.txt'
$OutRoot=Join-Path $Root 'dist-windows-portable'
$AppDir=Join-Path $OutRoot "Ekdeta-$AppVersion-win-x64"
$OutZip=Join-Path $OutRoot "Ekdeta-$AppVersion-win-x64-portable.zip"
New-Item -ItemType Directory -Force -Path $Cache,$OutRoot | Out-Null

$Core=(Resolve-Path (Join-Path $Root '..\Ekdeta.html')).Path
if(-not(Test-Path $Core)){ throw '找不到上層 Ekdeta.html。請使用完整 Ekdeta Desktop build kit。' }

$Sources=@(
  @{zip="https://github.com/electron/electron/releases/download/v$ElectronVersion/$Asset"; sums="https://github.com/electron/electron/releases/download/v$ElectronVersion/SHASUMS256.txt"},
  @{zip="https://repo.huaweicloud.com/electron/$ElectronVersion/$Asset"; sums="https://repo.huaweicloud.com/electron/$ElectronVersion/SHASUMS256.txt"}
)
function Download-First($kind,$dest){
  $last=$null
  foreach($s in $Sources){
    try{Write-Host "下載 $($s[$kind])";Invoke-WebRequest -UseBasicParsing -Uri $s[$kind] -OutFile $dest;return}catch{$last=$_;Write-Host '  失敗，改試下一個來源…'}
  }
  throw "無法下載 $kind：$last"
}
if(-not(Test-Path $Tmp)){Download-First 'zip' $Tmp}
Download-First 'sums' $Sums
$line=Get-Content $Sums | Where-Object {$_ -match ([regex]::Escape($Asset)+'$')} | Select-Object -First 1
if(-not $line){throw "SHASUMS256 找不到 $Asset"}
$expected=($line -split '\s+')[0].ToLowerInvariant();$actual=(Get-FileHash $Tmp -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $expected){Remove-Item $Tmp -Force;throw "Electron runtime SHA-256 不符：$actual != $expected"}
Write-Host "Electron runtime SHA-256：OK $actual"

if(Test-Path $AppDir){Remove-Item $AppDir -Recurse -Force}
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
Expand-Archive -Path $Tmp -DestinationPath $AppDir -Force
$defaultAsar=Join-Path $AppDir 'resources\default_app.asar';if(Test-Path $defaultAsar){Remove-Item $defaultAsar -Force}
$RuntimeExe=Join-Path $AppDir 'electron.exe';if(-not(Test-Path $RuntimeExe)){throw 'Electron runtime 缺少 electron.exe'}
Rename-Item $RuntimeExe 'Ekdeta.exe'
$Embedded=Join-Path $AppDir 'resources\app'
New-Item -ItemType Directory -Force -Path (Join-Path $Embedded 'src'),(Join-Path $Embedded 'resources\default') | Out-Null
Copy-Item package.json $Embedded -Force
Copy-Item src\*.js (Join-Path $Embedded 'src') -Force
Copy-Item resources\shell.config.json (Join-Path $Embedded 'resources') -Force
Copy-Item $Core (Join-Path $Embedded 'resources\default\app.html') -Force
Copy-Item resources\icons\Ekdeta.ico (Join-Path $AppDir 'Ekdeta.ico') -Force
Copy-Item 'installer\windows\README_給Windows使用者.txt' $AppDir -Force
Copy-Item 'installer\windows\安裝 Portable 到本機.cmd' $AppDir -Force
Copy-Item 'installer\windows\安裝 Portable 到本機.ps1' $AppDir -Force
"Ekdeta $AppVersion Windows x64`r`nElectron $ElectronVersion`r`nCore $AppVersion`r`n" | Set-Content (Join-Path $AppDir 'BUILD_INFO.txt') -Encoding UTF8
if(Test-Path $OutZip){Remove-Item $OutZip -Force}
Compress-Archive -Path "$AppDir\*" -DestinationPath $OutZip -CompressionLevel Optimal
$h=(Get-FileHash $OutZip -Algorithm SHA256).Hash.ToLowerInvariant()
"$h  $(Split-Path $OutZip -Leaf)" | Set-Content (Join-Path $OutRoot 'Ekdeta_1.2.3_Windows_x64_portable_SHA256.txt') -Encoding UTF8
Write-Host "`n✅ Ekdeta Windows x64 portable 已建立：$OutZip"
Start-Process explorer.exe $OutRoot
Write-Host '按 Enter 關閉…';[void][Console]::ReadLine()
