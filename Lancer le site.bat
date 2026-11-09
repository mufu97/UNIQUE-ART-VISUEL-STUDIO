@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est necessaire pour lancer le site.
  echo Installez Node.js, puis relancez ce fichier.
  pause
  exit /b 1
)

start "Unique Art Visuel Studio - serveur" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
endlocal
