@echo off
rem Health diary: local start at http://localhost:8080 (needs Python).
rem Without Python index.html opens directly: everything works except PWA install and offline cache.
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 1 >nul & start http://localhost:8080/"
  python -m http.server 8080 --bind 127.0.0.1
) else (
  start "" "%~dp0index.html"
)
