@echo off
set BAT_DIR=%~dp0

start "LabFlow Backend" cmd /k "cd /d "%BAT_DIR%backend" && venv\Scripts\activate && uvicorn main:app --reload --port 8000"

timeout /t 2 /nobreak > nul

start "LabFlow Frontend" cmd /k "cd /d "%BAT_DIR%frontend" && npm start"
