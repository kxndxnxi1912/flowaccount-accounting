@echo off
chcp 65001 >nul
echo Starting FlowAccount Accounting Server on port 3000...
start "FlowAccount Server" cmd /c "node D:\PreTest\flowaccount-accounting\server.js"
timeout /t 2 >nul
echo Starting Public Cloudflare Tunnel...
"D:\PreTest\flowaccount-accounting\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate
pause
