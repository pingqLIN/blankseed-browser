@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0starter\scripts\launch-tutorial.ps1"
if errorlevel 1 pause
endlocal
