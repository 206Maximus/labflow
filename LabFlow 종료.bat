@echo off
chcp 65001 > nul
title LabFlow 종료
taskkill /FI "WINDOWTITLE eq LabFlow Backend" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LabFlow Frontend" /T /F >nul 2>&1
echo 서버가 종료되었습니다.
timeout /t 2 /nobreak >nul
