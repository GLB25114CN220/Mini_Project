@echo off
setlocal EnableExtensions
title GL Bajaj ITM - Publish to GitHub
rem ==========================================================
rem  Uploads this project to https://github.com/GLB25114CN220/Mini_Project
rem  Needs Git for Windows (https://git-scm.com/download/win).
rem  A browser window may ask you to sign in to GitHub the first time.
rem  The secret file backend\.env is NOT uploaded (see .gitignore).
rem ==========================================================
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo  Git is not installed. Opening the download page.
  echo  Install it, then run this file again.
  start "" https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" git init
git branch -M main

rem --- who is making the upload (only set if Git has no name yet) ---
git config user.name >nul 2>nul
if errorlevel 1 git config user.name "GLB25114CN220"
git config user.email >nul 2>nul
if errorlevel 1 git config user.email "236448589+GLB25114CN220@users.noreply.github.com"

git add -A
git commit -m "GL Bajaj Dress Management website"
git remote remove origin >nul 2>nul
git remote add origin https://github.com/GLB25114CN220/Mini_Project.git
git push -u origin main
if errorlevel 1 (
  echo.
  echo  The upload did not finish. Check the message above ^(sign-in or internet problem^) and run this file again.
  pause
  exit /b 1
)
echo.
echo  Done! Your code is on GitHub: https://github.com/GLB25114CN220/Mini_Project
echo  Next: deploy it on Render, see "Put the website online" in README.md
pause
