@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

echo Ekdeta 1.2.3 - Windows x64 installer builder
echo ============================================================
where node >nul 2>nul || goto :neednode
where npm >nul 2>nul || goto :neednode

node sync_app_html.js || goto :fail
if exist package-lock.json (
  echo Using npm ci from package-lock.json...
  call npm ci --no-audit --no-fund || goto :fail
) else (
  echo package-lock.json missing. Refusing non-reproducible build.
  goto :fail
)
call npm run dist:win:x64 || goto :fail

echo.
echo Build complete. Check desktop\dist for the NSIS installer and ZIP.
start "" "%CD%\dist"
pause
exit /b 0

:neednode
echo Node.js/npm not found. Install the current Node.js LTS from https://nodejs.org/en/download
start "" "https://nodejs.org/en/download"
pause
exit /b 3

:fail
echo.
echo Windows build failed. See the messages above.
pause
exit /b 1
