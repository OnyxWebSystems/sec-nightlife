@echo off
title SEC Paystack Demo — Auto Recorder
cd /d "%~dp0"
echo.
echo ============================================================
echo   Auto Paystack demo recorder (Playwright + Edge)
echo ============================================================
echo.
echo   Keep THIS window open. Microsoft Edge will open separately.
echo   Sign in there, complete a test ticket purchase, then
echo   return here and press ENTER.
echo.
echo ============================================================
echo.
call npm run launch:paystack-demo
if errorlevel 1 (
  echo.
  echo Auto recorder failed. Use OPEN-PAYSTACK-DEMO.bat instead
  echo and record with Win+Alt+R.
  echo.
)
pause
