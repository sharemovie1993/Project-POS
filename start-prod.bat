@echo off
cd /d "%~dp0"

:: Ambil Port dari .env.production jika ada
set PORT=
for /f "tokens=2 delims==" %%i in ('findstr /i "^PORT=" .env.production 2^>nul') do set PORT=%%i
if "%PORT%"=="" set PORT=3000

title Kasirku POS - MODE PRODUCTION (Port %PORT%)
color 0F

echo.
echo ===================================================
echo   KASIRKU POS ^| MODE PRODUCTION
echo   URL      : http://localhost:%PORT%
echo   Database : kasir.db (DATA ASLI TOKO!)
echo ===================================================
echo.

:: -------------------------------------------------------
:: LANGKAH 1: Matikan proses yang sedang pakai port %PORT%
:: -------------------------------------------------------
echo [1/3] Memeriksa port %PORT%...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING" 2^>nul') do (
  echo [1/3] Port %PORT% sedang dipakai oleh PID %%a - menghentikan...
  taskkill /PID %%a /F >nul 2>&1
)

:: -------------------------------------------------------
:: LANGKAH 2: Tunggu port benar-benar kosong (max 10 detik)
:: -------------------------------------------------------
echo [2/3] Menunggu port %PORT% benar-benar bebas...
set WAIT=0
:WAIT_LOOP_PROD
set /a WAIT+=1
if %WAIT% GTR 10 (
  echo [!] Port %PORT% tidak bisa dikosongkan setelah 10 detik. Coba restart manual.
  pause
  exit /b 1
)
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
  echo [2/3] Port %PORT% masih sibuk... menunggu ^(%WAIT%/10^)
  timeout /t 1 /nobreak >nul
  goto WAIT_LOOP_PROD
)
echo [2/3] Port %PORT% sudah bebas.

:: -------------------------------------------------------
:: LANGKAH 3: Jalankan server production (Looping Auto-Restart)
:: -------------------------------------------------------
:RUN_SERVER
echo [3/3] Memulai server production...
echo.
echo ===================================================
echo   SERVER BERJALAN: http://localhost:%PORT%
echo   Tekan Ctrl+C untuk menghentikan.
echo ===================================================
echo.

set NODE_ENV=production
node server.js

echo.
echo ===================================================
echo   [INFO] Server dihentikan (kemungkinan karena update).
echo   Memulai ulang server secara otomatis dalam 3 detik...
echo ===================================================
timeout /t 3 /nobreak >nul
goto RUN_SERVER
