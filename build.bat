@echo off
rem Build Mission Control from your folder of project notes. Double-click, or run from any prompt.
rem The first run asks for the folder and remembers it in .mc-folder (delete that file to pick another).
rem Uses a venv inside the repo so nothing touches your main Python (standard library only, no installs).
rem Relative paths in --folder and --out are read from where you run it.
setlocal
set "HERE=%~dp0"
if not exist "%HERE%.venv\Scripts\python.exe" (
  echo Creating .venv ...
  py -3 -m venv "%HERE%.venv" || python -m venv "%HERE%.venv"
)
"%HERE%.venv\Scripts\python.exe" "%HERE%build.py" %*
if errorlevel 1 (
  echo.
  echo Build failed. See the message above.
  pause
  exit /b 1
)
echo.
echo Done. Open the Mission Control.html named above in Chrome or Edge.
timeout /t 4 >nul
