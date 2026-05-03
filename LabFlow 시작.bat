@echo off
title LabFlow
set "ROOT=%~dp0"

echo.
echo  ===================================
echo   LabFlow  Starting...
echo  ===================================
echo.

REM -- Desktop shortcut
cscript //nologo "%ROOT%create_shortcut.vbs"

REM -- Install packages
echo Installing packages...
call "%ROOT%backend\venv\Scripts\activate.bat"
pip install -r "%ROOT%backend\requirements.txt" -q
pip install "bcrypt<4.0" -q
echo Done.

REM -- DB migration
echo Running migration...
cd /d "%ROOT%backend"
python migrate_noshow_safety.py >nul 2>&1
echo Done.

REM -- Backend
echo Starting backend...
start "LabFlow Backend" cmd /k "cd /d "%ROOT%backend" && venv\Scripts\activate && uvicorn main:app --reload --port 8000"
timeout /t 5 /nobreak >nul

REM -- Frontend
echo Starting frontend...
start "LabFlow Frontend" cmd /k "cd /d "%ROOT%frontend" && npm start"

REM -- Browser
timeout /t 12 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo  Ready at http://localhost:3000
pause
