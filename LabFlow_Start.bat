@echo off
setlocal
title LabFlow
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo.
echo  ===================================
echo   LabFlow Starting...
echo  ===================================
echo.

REM -- Desktop shortcut
cscript //nologo "%ROOT%\create_shortcut.vbs" >nul 2>&1

call :resolve_python
if not defined PYTHON_CMD (
    echo [ERROR] Python 3.11 or newer was not found.
    echo Install Python, then run this launcher again.
    echo.
    pause
    exit /b 1
)

call :resolve_npm
if not defined NPM_CMD (
    echo [ERROR] Node.js and npm were not found.
    echo Install Node.js 18 or newer, then run this launcher again.
    echo.
    pause
    exit /b 1
)
if defined NODE_BIN_DIR set "PATH=%NODE_BIN_DIR%;%PATH%"

call :ensure_backend_venv
if errorlevel 1 exit /b 1

call :ensure_frontend_deps
if errorlevel 1 exit /b 1

echo Running migration...
pushd "%ROOT%\backend"
"%ROOT%\backend\venv\Scripts\python.exe" migrate_noshow_safety.py >nul 2>&1
popd
echo Done.

echo Starting backend...
start "LabFlow Backend" cmd /k "cd /d ""%ROOT%\backend"" && ""%ROOT%\backend\venv\Scripts\python.exe"" -m uvicorn main:app --reload --port 8000"
timeout /t 5 /nobreak >nul

echo Starting frontend...
start "LabFlow Frontend" cmd /k "cd /d ""%ROOT%\frontend"" && %NPM_CMD% start"

echo Waiting for frontend...
call :wait_for_frontend
start "" "http://localhost:3000"

echo.
echo Ready at http://localhost:3000
pause
exit /b 0

:resolve_python
set "PYTHON_CMD="
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=py -3"
)
if defined PYTHON_CMD exit /b 0

where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sys" >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=python"
)
if defined PYTHON_CMD exit /b 0

for %%P in (
    "C:\anaconda3\python.exe"
    "%USERPROFILE%\anaconda3\python.exe"
    "%USERPROFILE%\miniconda3\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) do (
    if exist %%~P (
        set "PYTHON_CMD=%%~P"
        goto :python_ready
    )
)
:python_ready
exit /b 0

:resolve_npm
set "NPM_CMD="
set "NODE_BIN_DIR="
where npm.cmd >nul 2>&1
if not errorlevel 1 set "NPM_CMD=npm.cmd"
if defined NPM_CMD exit /b 0

where npm >nul 2>&1
if not errorlevel 1 set "NPM_CMD=npm"
if defined NPM_CMD exit /b 0

for %%P in (
    "C:\anaconda3\npm.cmd"
    "%USERPROFILE%\anaconda3\npm.cmd"
    "%USERPROFILE%\miniconda3\npm.cmd"
    "C:\Program Files\nodejs\npm.cmd"
    "C:\Program Files (x86)\nodejs\npm.cmd"
) do (
    if exist %%~P (
        set "NPM_CMD=%%~P"
        set "NODE_BIN_DIR=%%~dpP"
        goto :npm_ready
    )
)
:npm_ready
if defined NODE_BIN_DIR if "%NODE_BIN_DIR:~-1%"=="\" set "NODE_BIN_DIR=%NODE_BIN_DIR:~0,-1%"
exit /b 0

:ensure_backend_venv
if exist "%ROOT%\backend\venv\Scripts\python.exe" goto backend_venv_ready

echo Creating backend virtual environment...
pushd "%ROOT%\backend"
%PYTHON_CMD% -m venv venv
if errorlevel 1 (
    popd
    echo [ERROR] Failed to create the backend virtual environment.
    echo.
    pause
    exit /b 1
)
popd

:backend_venv_ready
echo Checking backend packages...
"%ROOT%\backend\venv\Scripts\python.exe" -c "import fastapi, sqlalchemy, uvicorn, passlib, bcrypt" >nul 2>&1
if not errorlevel 1 goto backend_packages_ready

echo Installing backend packages...
"%ROOT%\backend\venv\Scripts\python.exe" -m pip install --upgrade pip --disable-pip-version-check
"%ROOT%\backend\venv\Scripts\python.exe" -m pip install -r "%ROOT%\backend\requirements.txt" --disable-pip-version-check
if errorlevel 1 (
    echo [ERROR] Failed to install backend packages.
    echo.
    pause
    exit /b 1
)
:backend_packages_ready
echo Done.
exit /b 0

:ensure_frontend_deps
if exist "%ROOT%\frontend\node_modules\.bin\react-scripts.cmd" exit /b 0

echo Installing frontend packages...
pushd "%ROOT%\frontend"
call %NPM_CMD% install --no-audit --no-fund
if errorlevel 1 (
    popd
    echo [ERROR] Failed to install frontend packages.
    echo.
    pause
    exit /b 1
)
popd
echo Done.
exit /b 0

:wait_for_frontend
for /l %%I in (1,1,60) do (
    powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
echo [WARN] Frontend did not respond within 60 seconds. Opening browser anyway.
exit /b 0
