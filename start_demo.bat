@echo off
REM DIstoHelp — one-command demo boot (backend + frontend + public tunnel instructions)
REM Usage:  start_demo.bat

echo.
echo === DIstoHelp: starting backend (port 8000) ===
start "DIstoHelp Backend" cmd /k "cd /d %~dp0backend && .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"

echo === DIstoHelp: starting frontend (port 5173) ===
start "DIstoHelp Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host"

echo.
echo NOTE: after ~10 seconds, open http://localhost:5173
echo Optional public tunnel:  "C:\Users\User\Desktop\first response system\cloudflared.exe" tunnel --url http://localhost:5173 --no-autoupdate --protocol http2
echo.
pause
