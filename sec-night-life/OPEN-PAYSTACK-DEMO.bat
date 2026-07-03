@echo off
title SEC Paystack Demo — Open in Edge
cd /d "%~dp0"
echo.
echo ============================================================
echo   Opening SEC in Microsoft Edge
echo ============================================================
echo.
echo   Edge will open in a NEW window.
echo.
echo   RECORD THE DEMO (Windows built-in):
echo     1. Press  Win + Alt + R  to start screen recording
echo     2. Sign in as party-goer, buy a test ticket
echo        Test card: 4084084084084081  CVV 408
echo     3. Show ticket in Profile -^> Tickets
echo     4. Press  Win + Alt + R  again to stop
echo     5. Save the video as:
echo        launch-resources\paystack\payment-demo-ticket.mp4
echo.
echo ============================================================
echo.
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --new-window --start-maximized "https://secnightlife.com/Login?role=PARTY_GOER&returnUrl=%2FEvents"
echo Edge launched. If you do not see it, check the taskbar.
echo.
pause
