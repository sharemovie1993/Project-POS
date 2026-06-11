@echo off
title Kasirku POS - MODE DEVELOPMENT
color 0A

echo.
echo ===================================================
echo   KASIRKU POS ^| MODE DEVELOPMENT
echo   Database : kasir_dev.db (data testing)
echo   MikroTik : Aktif (live test)
echo   Auto-restart saat ada perubahan kode
echo ===================================================
echo.

:: Set environment ke development
set NODE_ENV=development

:: Jalankan dengan nodemon untuk auto-restart
echo [DEV] Memulai server development dengan nodemon...
echo [DEV] Tekan Ctrl+C untuk menghentikan server.
echo.

npx nodemon server.js

pause
