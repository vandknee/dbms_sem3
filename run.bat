@echo off
cd /d "%~dp0"

echo Starting RiverTrace...

set PORT=8081
start "" "http://127.0.0.1:8081"
call npm.cmd start

pause