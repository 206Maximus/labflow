@echo off
title LabFlow 종료

echo ========================================
echo   LabFlow 서버 종료 중...
echo ========================================

:: uvicorn (백엔드) 종료
taskkill /FI "WINDOWTITLE eq LabFlow Backend" /T /F > nul 2>&1

:: node (프론트엔드) 종료
taskkill /FI "WINDOWTITLE eq LabFlow Frontend" /T /F > nul 2>&1

echo 서버가 종료되었습니다.
timeout /t 2 /nobreak > nul
