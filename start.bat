@echo off
title Menjalankan Aplikasi Kasirku POS Lokal (PRODUCTION)
color 0a

echo =======================================================
echo     MEMULAI APLIKASI KASIRKU POS LOKAL (PRODUCTION)
echo =======================================================
echo.

:: Cek instalasi Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js tidak terdeteksi di komputer Anda!
    echo Silakan instal Node.js terlebih dahulu untuk menjalankan aplikasi.
    echo Kunjungi: https://nodejs.org/
    echo.
    pause
    exit /b
)

:: Pindah ke folder script berjalan
cd /d "%~dp0"

:: Cek apakah folder node_modules sudah ada
if not exist node_modules (
    echo [INFO] Menemukan dependensi belum terinstal.
    echo Menjalankan 'npm install'... Silakan tunggu sebentar...
    call npm install
    echo.
)

:: Matikan proses yang memakai port 3000
set PORT=3000
echo [INFO] Memeriksa port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING" 2^>nul') do (
  echo [INFO] Port %PORT% sedang dipakai oleh PID %%a - menghentikan...
  taskkill /PID %%a /F >nul 2>&1
)

:: Tunggu port bebas (max 10 detik)
set WAIT=0
:WAIT_LOOP
set /a WAIT+=1
if %WAIT% GTR 10 (
  echo [!] Port %PORT% tidak bisa dikosongkan setelah 10 detik.
  pause
  exit /b 1
)
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
  timeout /t 1 /nobreak >nul
  goto WAIT_LOOP
)

:: Menjalankan server di background
echo [INFO] Menjalankan server kasir lokal (Port %PORT%)...
set NODE_ENV=production
start "" /b node server.js

:: Tunggu 2 detik untuk memastikan server sudah aktif
echo [INFO] Membuka antarmuka kasir di browser Anda...
timeout /t 2 /nobreak >nul

:: Buka browser ke alamat localhost
start http://localhost:%PORT%

echo.
echo =======================================================
echo  Aplikasi Kasirku POS sudah berjalan di:
echo  http://localhost:%PORT%
echo.
echo  PENTING: Jangan tutup jendela hitam ini selama
echo  menggunakan aplikasi Kasirku POS!
echo =======================================================
echo.

:: Menjaga agar CMD tetap aktif untuk menampilkan logs server
cmd /k
