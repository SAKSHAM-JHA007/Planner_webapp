@echo off
echo Installing dependencies...
call npm install
echo Starting Planner App Server...
start http://localhost:3000
call node server.js
pause
