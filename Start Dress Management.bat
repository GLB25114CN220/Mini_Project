@echo off
setlocal EnableExtensions
rem ==========================================================
rem  GL Bajaj ITM - Dress Management : daily launcher
rem  (the desktop shortcut made by "Install App Shortcut.bat"
rem   runs this file)
rem  It starts the server if it is not running yet, then opens
rem  the website in its own app-style window.
rem ==========================================================
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"

rem --- port from backend\.env (default 3000) ---
set "PORT=3000"
if exist "%BACKEND%\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /i "PORT=" "%BACKEND%\.env"`) do set "PORT=%%B"
)
set "URL=http://localhost:%PORT%/"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please run "Install App Shortcut.bat" first.
  pause
  exit /b 1
)
if not exist "%BACKEND%\node_modules" (
  echo First-time setup is not finished. Please run "Install App Shortcut.bat" first.
  pause
  exit /b 1
)

rem --- is the server already running on this port? ---
powershell -NoProfile -Command "try{(New-Object Net.Sockets.TcpClient('127.0.0.1',%PORT%)).Close();exit 0}catch{exit 1}" >nul 2>nul
if errorlevel 1 (
  start "GL Bajaj Dress Management Server (close this window to stop)" /min cmd /c "cd /d "%BACKEND%" && npm start"
  rem wait up to 30 seconds for the server to answer
  powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{(New-Object Net.Sockets.TcpClient('127.0.0.1',%PORT%)).Close();exit 0}catch{Start-Sleep -Milliseconds 500}};exit 1" >nul 2>nul
  if errorlevel 1 (
    echo The server did not start. Open a terminal in the "backend" folder and run:  npm start
    pause
    exit /b 1
  )
)

rem --- open as an app window (Edge or Chrome); otherwise the normal browser ---
set "BROWSER="
for %%P in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)
if defined BROWSER (
  start "" "%BROWSER%" --app=%URL%
) else (
  start "" %URL%
)
endlocal
exit /b 0
