# =================================================================
# 🚀 KASIRKU POS DUPLICATION WIZARD (WINDOWS)
# =================================================================
# Script ini menduplikasi proyek POS ke direktori baru
# dan mengonfigurasi database serta port secara otomatis.
# =================================================================

Clear-Host
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       🚀 KASIRKU POS DUPLICATION WIZARD 🚀       " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Script ini akan membuat salinan aplikasi POS dengan port & database baru."
Write-Host "---------------------------------------------------"

# 1. Input nama folder baru
$DefaultTarget = "Project-POS-Absenta"
$TargetFolder = Read-Host "Masukkan nama folder tujuan (di Documents) [$DefaultTarget]"
if ([string]::IsNullOrEmpty($TargetFolder)) { $TargetFolder = $DefaultTarget }

$ParentDir = "c:\Users\admin\Documents"
$TargetPath = Join-Path $ParentDir $TargetFolder
$SourcePath = "c:\Users\admin\Documents\Project-POS"

Write-Host "`nTarget Direktori: $TargetPath" -ForegroundColor Yellow

if (Test-Path $TargetPath) {
    Write-Host "[WARNING] Folder $TargetPath sudah ada!" -ForegroundColor Red
    $Confirm = Read-Host "Apakah Anda ingin menghapus dan menuliskannya kembali? (y/n)"
    if ($Confirm -eq 'y' -or $Confirm -eq 'Y') {
        Write-Host "Menghapus folder lama..." -ForegroundColor Gray
        Remove-Item -Path $TargetPath -Recurse -Force
    } else {
        Write-Host "Proses dibatalkan." -ForegroundColor Yellow
        exit
    }
}

# 2. Input Konfigurasi Database & Port
$DefaultPort = "3002"
$Port = Read-Host "Masukkan Port Produksi [$DefaultPort]"
if ([string]::IsNullOrEmpty($Port)) { $Port = $DefaultPort }

$DefaultDevPort = "3003"
$DevPort = Read-Host "Masukkan Port Development [$DefaultDevPort]"
if ([string]::IsNullOrEmpty($DevPort)) { $DevPort = $DefaultDevPort }

$DefaultDb = "kasir_absenta.db"
$DbName = Read-Host "Masukkan Nama File Database [$DefaultDb]"
if ([string]::IsNullOrEmpty($DbName)) { $DbName = $DefaultDb }

$DefaultDevDb = "kasir_absenta_dev.db"
$DevDbName = Read-Host "Masukkan Nama File Database Dev [$DefaultDevDb]"
if ([string]::IsNullOrEmpty($DevDbName)) { $DevDbName = $DefaultDevDb }

# 3. Proses Duplikasi
Write-Host "`n[1/4] Menduplikasi berkas kode..." -ForegroundColor Yellow
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "Menggunakan Git clone lokal untuk kecepatan..." -ForegroundColor Gray
    git clone $SourcePath $TargetPath
} else {
    Write-Host "Git tidak terdeteksi. Menyalin file secara manual (kecuali node_modules)..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $TargetPath -Force
    Copy-Item -Path "$SourcePath\*" -Destination $TargetPath -Recurse -Exclude "node_modules", ".git", "kasir.db", "kasir_dev.db" -Force
}

# 4. Tulis file .env baru di target
Write-Host "`n[2/4] Menulis file konfigurasi environment..." -ForegroundColor Yellow

$EnvProdContent = @"
NODE_ENV=production
PORT=$Port
HOST=0.0.0.0
DB_NAME=$DbName
LOG_LEVEL=verbose
MIKROTIK_ENABLED=true
"@

$EnvDevContent = @"
NODE_ENV=development
PORT=$DevPort
HOST=0.0.0.0
DB_NAME=$DevDbName
LOG_LEVEL=verbose
MIKROTIK_ENABLED=true
"@

Set-Content -Path (Join-Path $TargetPath ".env.production") -Value $EnvProdContent -Encoding utf8
Set-Content -Path (Join-Path $TargetPath ".env.development") -Value $EnvDevContent -Encoding utf8

# Hapus database lama jika tersalin
Remove-Item -Path (Join-Path $TargetPath "kasir.db") -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $TargetPath "kasir_dev.db") -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $TargetPath "kasir_dev.db-journal") -ErrorAction SilentlyContinue

# 5. Jalankan npm install di target
Write-Host "`n[3/4] Menginstall dependensi proyek (npm install)..." -ForegroundColor Yellow
Push-Location $TargetPath
npm install --production
Pop-Location

# 6. Ringkasan
Write-Host "`n===================================================" -ForegroundColor Green
Write-Host "🎉 DUPLIKASI PROYEK BERHASIL SELESAI! 🎉" -ForegroundColor Green
Write-Host "Folder Proyek   : $TargetPath" -ForegroundColor Green
Write-Host "Port Produksi   : $Port" -ForegroundColor Green
Write-Host "Database File   : $DbName" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host "Cara Menjalankan di Windows:" -ForegroundColor Yellow
Write-Host "1. Masuk ke folder: cd $TargetPath" -ForegroundColor Gray
Write-Host "2. Klik ganda 'start.bat' atau 'start-prod.bat' untuk menjalankan mode Production." -ForegroundColor Gray
Write-Host "===================================================" -ForegroundColor Green
