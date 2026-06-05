@echo off
setlocal
cd /d "%~dp0"
echo Installing Universal Audio Overlay dependencies...
echo.
npm install
if errorlevel 1 (
  echo.
  echo Install failed. Make sure Node.js is installed, then run this file again.
  pause
  exit /b 1
)
echo.
echo Done. You can now run "Start Universal Audio Overlay.bat".
pause
