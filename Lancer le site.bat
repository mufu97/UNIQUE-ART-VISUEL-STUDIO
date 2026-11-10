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

if not exist "node_modules\pg" (
  echo Premiere utilisation : installation des composants du site, patientez...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo L'installation a echoue. Verifiez la connexion Internet, puis relancez ce fichier.
    pause
    exit /b 1
  )
)

node "scripts\preparer-local.js"

start "Unique Art Visuel Studio - serveur" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
endlocal
