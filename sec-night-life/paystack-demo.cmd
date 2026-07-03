@echo off
title SEC Paystack Demo Recorder
cd /d "%~dp0"
echo.
echo ============================================================
echo   SEC Paystack Demo Recorder
echo ============================================================
echo.
echo   Uses your installed Google Chrome (a new window opens).
echo.
echo   1. Sign in as PARTY-GOER in the Chrome window
echo   2. Buy a test ticket (card 4084084084084081)
echo   3. Show ticket in Profile -^> Tickets
echo   4. Press ENTER in this window when done
echo.
echo ============================================================
echo.
call npm run launch:paystack-demo
echo.
pause
