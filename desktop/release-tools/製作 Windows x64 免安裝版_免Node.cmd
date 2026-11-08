@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo This no-Node path needs a pre-synced resources\default\app.html.
  echo The public EKdelta desktop kit includes it. If it is missing, use the formal Node.js builder once.
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows-portable-no-node.ps1"
if errorlevel 1 pause
