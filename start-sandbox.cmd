@echo off
setlocal
REM Switch console codepage to UTF-8 so Chinese output from PowerShell and Node renders cleanly.
chcp 65001 >nul 2>nul
REM If double-clicked from Explorer (which starts in System32), switch to script directory;
REM otherwise preserve the caller's current directory so relative .\.dsh-sandbox resolves from %CD%.
if /I "%CD%"=="%SystemRoot%\System32" cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-sandbox.ps1" %*
exit /b %ERRORLEVEL%
