$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root
function Pause-End([string]$Message) { Write-Host "`n$Message"; Write-Host '按 Enter 關閉…'; [void][Console]::ReadLine() }
try {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw '這支建置器只能在 Windows 執行。' }
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '找不到 Node.js / npm。只有製作正式安裝包的人需要 Node.js LTS。' }
  Write-Host 'Ekdeta 1.2.3 — Windows x64 build'
  Write-Host "Root: $Root"
  Write-Host "Node: $(node --version)"
  Write-Host "npm : $(npm.cmd --version)"
  & node sync_app_html.js
  if ($LASTEXITCODE -ne 0) { throw 'Ekdeta.html 同步失敗。' }
  & node verify\verify_windows.js
  if ($LASTEXITCODE -ne 0) { throw 'Windows source gate 失敗。' }
  if (Test-Path package-lock.json) { & npm.cmd ci --no-audit --no-fund } else { throw 'package-lock.json 不存在；拒絕建立不可重現的 release build。' }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci 失敗。' }
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  if (Test-Path dist) { Remove-Item dist -Recurse -Force }
  & npm.cmd run dist:win:x64
  if ($LASTEXITCODE -ne 0) { throw 'electron-builder Windows x64 build 失敗。' }
  $Exe = Get-ChildItem dist -File -Filter '*.exe' | Select-Object -First 1
  $Zip = Get-ChildItem dist -File -Filter '*.zip' | Select-Object -First 1
  if (-not $Exe) { throw '找不到 NSIS .exe 安裝器。' }
  if (-not $Zip) { throw '找不到 Windows .zip 產物。' }
  $HashFile = Join-Path dist 'Ekdeta_1.2.3_Windows_x64_SHA256.txt'
  @($Exe,$Zip) | ForEach-Object { $h=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); "$h  $($_.Name)" } | Set-Content -Path $HashFile -Encoding UTF8
  Write-Host "`n✅ Windows x64 build 完成"
  Write-Host "Installer: $($Exe.FullName)"
  Write-Host "Portable : $($Zip.FullName)"
  Start-Process explorer.exe $Root\dist
  Pause-End '建置完成。'
} catch { Write-Host "`n❌ Windows 安裝包製作失敗：$($_.Exception.Message)" -ForegroundColor Red; Pause-End '請保留這個 Terminal 最後一段訊息。'; exit 1 }
