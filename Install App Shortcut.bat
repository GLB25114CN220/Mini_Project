@echo off
setlocal EnableExtensions
title GL Bajaj ITM - Install App Shortcut
rem ==========================================================
rem  GL Bajaj ITM - Dress Management : ONE-TIME SETUP
rem  Double-click this file once. It will:
rem    1. check that Node.js is installed
rem    2. install the backend packages (npm install)
rem    3. put a "GL Bajaj Dress Management" shortcut on your Desktop
rem    4. open the website
rem  After that, just use the Desktop shortcut.
rem ==========================================================
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "LAUNCHER=%ROOT%Start Dress Management.bat"

echo.
echo  GL Bajaj ITM - Dress Management : setup
echo  ----------------------------------------
echo.

if not exist "%BACKEND%\package.json" (
  echo  ERROR: the "backend" folder was not found next to this file.
  echo  Keep this file inside the project folder ^(the one that contains "backend" and "Mini_Project"^).
  goto :fail
)
if not exist "%LAUNCHER%" (
  echo  ERROR: "Start Dress Management.bat" is missing from the project folder.
  goto :fail
)

rem --- 1. Node.js (version 22.13 or newer is needed) ---
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed.
  echo  Opening the download page. Install the LTS version, then run this file again.
  start "" https://nodejs.org
  goto :fail
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo  Your Node.js is too old. This project needs version 22.13 or newer.
  echo  Opening the download page. Install the LTS version, then run this file again.
  start "" https://nodejs.org
  goto :fail
)
echo  [1/3] Node.js found.

rem --- 2. backend packages ---
echo  [2/3] Installing backend packages ^(first time can take a minute^)...
pushd "%BACKEND%"
call npm install
if errorlevel 1 (
  popd
  echo.
  echo  npm install failed. Check your internet connection and try again.
  goto :fail
)
popd

rem --- 3. desktop shortcut ---
echo  [3/3] Creating the Desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\GL Bajaj Dress Management.lnk'); $s.TargetPath=$env:LAUNCHER; $s.WorkingDirectory=$env:ROOT; $s.WindowStyle=7; $s.Description='GL Bajaj ITM Dress Management'; $s.IconLocation=$env:SystemRoot+'\System32\shell32.dll,13'; $s.Save()"
if errorlevel 1 (
  echo  Could not create the shortcut. You can still start the app with "Start Dress Management.bat".
) else (
  echo  Shortcut "GL Bajaj Dress Management" added to your Desktop.
)

echo.
echo  Setup finished. Opening the website now...
echo.
echo  Student login : enter an Admission ID ^(example: ADM-2026-0001^)
echo  Admin login   : admin@glbajaj.ac.in   ^(password is in backend\.env^)
echo.
call "%LAUNCHER%"
endlocal
exit /b 0

:fail
echo.
pause
endlocal
exit /b 1
