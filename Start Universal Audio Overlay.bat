@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo Dependencies are missing. Running npm install first...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Make sure Node.js is installed.
    pause
    exit /b 1
  )
)
npm start
