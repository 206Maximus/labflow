@echo off
title LabFlow
set "ROOT=%~dp0"

echo.
echo  ========================================
echo   LabFlow  Starting...
echo  ========================================
echo.

REM -- Activate venv and install packages
echo [1/3] Installing backend packages...
call "%ROOT%backend\venv\Scripts\activate.bat"
pip install -r "%ROOT%backend\requirements.txt" -q --disable-pip-version-check
echo Done.

REM -- Start Backend
echo [2/3] Starting backend server...
start "LabFlow Backend" /d "%ROOT%backend" cmd /k "venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"
timeout /t 8 /nobreak >nul

REM -- Start Frontend
echo [3/3] Starting frontend...
start "LabFlow Frontend" /d "%ROOT%frontend" cmd /k "npm start"
timeout /t 15 /nobreak >nul

REM -- Open browser
start "" http://localhost:3000

echo.
echo  ========================================
echo   Ready!  http://localhost:3000
echo   API  :  http://localhost:8000/docs
echo  ========================================
echo.
pause
