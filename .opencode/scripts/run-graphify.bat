@echo off
setlocal
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "OPENCODE_DIR=%%~fI"
for %%I in ("%OPENCODE_DIR%..") do set "REPO_ROOT=%%~fI"
set "VENV_PYTHON=%OPENCODE_DIR%\.venv\Scripts\python.exe"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
if "%GRAPHIFY_QUIET%"=="" set "GRAPHIFY_QUIET=1"

if not exist "%VENV_PYTHON%" (
  echo Python venv not found at "%VENV_PYTHON%"
  exit /b 1
)

if "%1"=="query" (
  "%VENV_PYTHON%" "%SCRIPT_DIR%graphify-query.py" %2 %3 %4 %5 %6 %7 %8 %9
) else if "%1"=="path" (
  "%VENV_PYTHON%" "%SCRIPT_DIR%graphify-path.py" %2 %3 %4 %5 %6 %7 %8 %9
) else if "%1"=="explain" (
  "%VENV_PYTHON%" "%SCRIPT_DIR%graphify-explain.py" %2 %3 %4 %5 %6 %7 %8 %9
) else if "%1"=="update" (
  if "%2"=="" (
    "%VENV_PYTHON%" -m graphify update "%REPO_ROOT%"
  ) else (
    "%VENV_PYTHON%" -m graphify update %2 %3 %4 %5 %6 %7 %8 %9
  )
) else (
  echo Unknown command: %1
  exit /b 1
)
