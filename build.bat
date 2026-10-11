@echo off
rem Rebuild Mission Control from the vault. Double-click, or run from any prompt.
rem Uses a project-local venv so nothing touches the main Python (stdlib only, no installs).
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating .venv ...
  py -3 -m venv .venv || python -m venv .venv
)
".venv\Scripts\python.exe" build.py %*
if errorlevel 1 (
  echo.
  echo Build failed. See the message above.
  pause
  exit /b 1
)
echo.
echo Done. Open "00 Home\Mission Control.html" in the vault, or click the link in Home MOC.
timeout /t 4 >nul
