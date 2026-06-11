#!/bin/bash

# =================================================================
# 🚀 KASIRKU POS DEPLOYMENT SCRIPT FOR LINUX (DEBIAN/UBUNTU)
# =================================================================
# Script ini mengotomatiskan instalasi Node.js, PM2, konfigurasi env,
# serta manajemen proses server agar mudah digunakan di VPS.
# =================================================================

# Warna untuk output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Bersihkan layar
clear

# Cek apakah dijalankan di sistem operasi Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo -e "${RED}[ERROR] Script ini didesain untuk dijalankan di sistem operasi Linux (Ubuntu/Debian).${NC}"
    exit 1
fi

show_banner() {
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "${CYAN}             🚀 KASIRKU POS DEPLOYMENT WIZARD 🚀                 ${NC}"
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "Aplikasi akan dijalankan menggunakan PM2 agar berjalan di background."
    echo -e "Status Server saat ini: "
    if command -v pm2 &> /dev/null && pm2 describe project-pos &> /dev/null; then
        echo -e "● PM2 Status: ${GREEN}Running / Configured${NC}"
    else
        echo -e "● PM2 Status: ${RED}Not running / Not configured${NC}"
    fi
    echo -e "${CYAN}-----------------------------------------------------------------${NC}"
}

install_dependencies() {
    echo -e "\n${YELLOW}[1/4] Memulai Instalasi Dependensi Sistem...${NC}"
    
    # Update package list
    echo -e "${CYAN}Mengupdate daftar paket sistem (apt update)...${NC}"
    sudo apt-get update -y
    
    # Install Git & Curl & Build tools
    echo -e "${CYAN}Menginstall git, curl, build-essential, dan sqlite3...${NC}"
    sudo apt-get install -y git curl build-essential sqlite3
    
    # Install Node.js (NodeSource LTS 20) jika belum terpasang atau versi terlalu lama
    if ! command -v node &> /dev/null; then
        echo -e "${CYAN}Node.js belum terinstall. Mengunduh setup NodeSource v20 LTS...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        NODE_VER=$(node -v)
        echo -e "${GREEN}Node.js sudah terinstall dengan versi: $NODE_VER${NC}"
    fi
    
    # Install PM2 secara global
    if ! command -v pm2 &> /dev/null; then
        echo -e "${CYAN}Menginstall PM2 secara global...${NC}"
        sudo npm install -g pm2
    else
        echo -e "${GREEN}PM2 sudah terinstall secara global.${NC}"
    fi

    # Install dependencies project (production only)
    echo -e "${CYAN}Menginstall NPM dependencies untuk project...${NC}"
    npm install --production
    
    echo -e "${GREEN}[SUKSES] Semua dependensi berhasil diinstall!${NC}"
    read -p "Tekan [ENTER] untuk kembali ke menu utama..."
}

configure_env() {
    echo -e "\n${YELLOW}[2/4] Setup Konfigurasi (.env.production)...${NC}"
    
    # Baca nilai default jika file sudah ada
    DEFAULT_PORT=3000
    DEFAULT_HOST="0.0.0.0"
    DEFAULT_DB="kasir.db"
    DEFAULT_LOG="verbose"
    DEFAULT_MIKROTIK="true"
    
    if [ -f .env.production ]; then
        source .env.production 2>/dev/null
        DEFAULT_PORT=${PORT:-3000}
        DEFAULT_HOST=${HOST:-0.0.0.0}
        DEFAULT_DB=${DB_NAME:-kasir.db}
        DEFAULT_LOG=${LOG_LEVEL:-verbose}
        DEFAULT_MIKROTIK=${MIKROTIK_ENABLED:-true}
    fi
    
    echo -e "Masukkan pengaturan di bawah ini (Tekan [ENTER] jika ingin menggunakan nilai default):"
    
    # Input Port
    read -p "Port Server [$DEFAULT_PORT]: " input_port
    PORT=${input_port:-$DEFAULT_PORT}
    
    # Input Host
    echo -e "${YELLOW}Tips Keamanan: Jika menggunakan VPN WireGuard, Anda bisa memasukkan IP VPN Anda (misal: 10.0.0.1) agar server hanya dapat diakses melalui jalur VPN.${NC}"
    read -p "IP Binding Host [$DEFAULT_HOST]: " input_host
    HOST=${input_host:-$DEFAULT_HOST}
    
    # Input Database Name
    read -p "Nama Database File [$DEFAULT_DB]: " input_db
    DB_NAME=${input_db:-$DEFAULT_DB}
    
    # Input Log Level
    read -p "Log Level (verbose / error) [$DEFAULT_LOG]: " input_log
    LOG_LEVEL=${input_log:-$DEFAULT_LOG}
    
    # Input Mikrotik
    read -p "Aktifkan integrasi MikroTik? (true / false) [$DEFAULT_MIKROTIK]: " input_mikrotik
    MIKROTIK_ENABLED=${input_mikrotik:-$DEFAULT_MIKROTIK}
    
    # Tulis ke file .env.production
    cat <<EOF > .env.production
# =================================================================
# KASIRKU POS PRODUCTION ENVIRONMENT CONFIGURATION
# Generated on $(date)
# =================================================================
NODE_ENV=production
PORT=$PORT
HOST=$HOST
DB_NAME=$DB_NAME
LOG_LEVEL=$LOG_LEVEL
MIKROTIK_ENABLED=$MIKROTIK_ENABLED
EOF
    
    echo -e "\n${GREEN}[SUKSES] Konfigurasi berhasil disimpan ke file .env.production!${NC}"
    echo -e "${CYAN}Isi file konfigurasi:${NC}"
    cat .env.production
    echo -e "${CYAN}--------------------------------------------------${NC}"
    read -p "Tekan [ENTER] untuk kembali ke menu utama..."
}

start_app() {
    echo -e "\n${YELLOW}[3/4] Menjalankan / Restart Aplikasi via PM2...${NC}"
    
    if [ ! -f .env.production ]; then
        echo -e "${YELLOW}[Peringatan] File .env.production belum ada. Menggunakan konfigurasi default...${NC}"
        cat <<EOF > .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DB_NAME=kasir.db
LOG_LEVEL=verbose
MIKROTIK_ENABLED=true
EOF
    fi
    
    # Jalankan app menggunakan PM2
    echo -e "Menjalankan aplikasi dengan nama 'project-pos' di PM2..."
    NODE_ENV=production pm2 start server.js --name "project-pos" || NODE_ENV=production pm2 restart "project-pos"
    
    # Simpan konfigurasi PM2
    pm2 save
    
    echo -e "\n${GREEN}[SUKSES] Aplikasi berhasil dijalankan!${NC}"
    echo -e "${YELLOW}Untuk membuat PM2 otomatis berjalan saat VPS reboot/restart, silakan jalankan perintah ini:${NC}"
    echo -e "${CYAN}pm2 startup${NC}"
    echo -e "Lalu salin & jalankan baris perintah output dari command tersebut di terminal Anda."
    read -p "Tekan [ENTER] untuk kembali ke menu utama..."
}

configure_ufw() {
    echo -e "\n${YELLOW}[4/4] Konfigurasi UFW Firewall (Opsional Keamanan)...${NC}"
    if ! command -v ufw &> /dev/null; then
        echo -e "${RED}[ERROR] UFW Firewall tidak terpasang di VPS Anda. Pasang dulu menggunakan: sudo apt install ufw${NC}"
        read -p "Tekan [ENTER] untuk kembali..."
        return
    fi
    
    # Cek Port dari env
    PORT_TO_ALLOW=3000
    if [ -f .env.production ]; then
        source .env.production 2>/dev/null
        PORT_TO_ALLOW=${PORT:-3000}
    fi
    
    echo -e "UFW Firewall Menu:"
    echo -e "1) Buka Port SSH (22) dan HTTP/HTTPS (80/443) - Wajib sebelum mengaktifkan UFW agar tidak terkunci"
    echo -e "2) Buka Port Aplikasi Kasir ($PORT_TO_ALLOW) untuk Publik (0.0.0.0)"
    echo -e "3) Aktifkan UFW Firewall"
    echo -e "4) Cek Status Firewall"
    echo -e "5) Kembali ke Menu Utama"
    read -p "Pilih menu [1-5]: " ufw_choice
    
    case $ufw_choice in
        1)
            echo -e "${CYAN}Membuka akses port standar (SSH, HTTP, HTTPS)...${NC}"
            sudo ufw allow 22/tcp
            sudo ufw allow 80/tcp
            sudo ufw allow 443/tcp
            echo -e "${GREEN}Akses port standar berhasil diizinkan.${NC}"
            ;;
        2)
            echo -e "${CYAN}Membuka akses port aplikasi ($PORT_TO_ALLOW) ke publik...${NC}"
            sudo ufw allow $PORT_TO_ALLOW/tcp
            echo -e "${GREEN}Akses port $PORT_TO_ALLOW berhasil dibuka.${NC}"
            ;;
        3)
            echo -e "${YELLOW}Mengaktifkan UFW Firewall. Koneksi SSH Anda tidak akan terputus jika Anda sudah membuka port 22 di langkah 1.${NC}"
            read -p "Apakah Anda yakin ingin mengaktifkan UFW? (y/n): " confirm_ufw
            if [ "$confirm_ufw" = "y" ] || [ "$confirm_ufw" = "Y" ]; then
                sudo ufw enable
            fi
            ;;
        4)
            sudo ufw status verbose
            ;;
        *)
            return
            ;;
    esac
    read -p "Tekan [ENTER] untuk kembali..."
}

stop_app() {
    echo -e "\n${YELLOW}Menghentikan Aplikasi via PM2...${NC}"
    pm2 stop "project-pos"
    echo -e "${GREEN}Aplikasi berhasil dihentikan.${NC}"
    read -p "Tekan [ENTER] untuk kembali..."
}

view_logs() {
    echo -e "\n${YELLOW}Membuka Live Log Server (Tekan Ctrl+C untuk keluar dari log)...${NC}"
    pm2 logs "project-pos"
}

view_status() {
    echo -e "\n${YELLOW}Status Proses PM2 saat ini:${NC}"
    pm2 status "project-pos"
    echo -e "\n${YELLOW}Detail Informasi Aplikasi:${NC}"
    pm2 describe "project-pos"
    read -p "Tekan [ENTER] untuk kembali..."
}

# Loop menu utama
while true; do
    clear
    show_banner
    echo -e "1) Install Dependensi Sistem (Node.js, PM2, sqlite3, git)"
    echo -e "2) Atur File Konfigurasi Baru (.env.production)"
    echo -e "3) Jalankan / Restart Aplikasi (PM2)"
    echo -e "4) Atur Keamanan UFW Firewall (Opsional)"
    echo -e "5) Lihat Status Aplikasi"
    echo -e "6) Lihat Log Server Terkini (Live)"
    echo -e "7) Hentikan Sementara Aplikasi (PM2 Stop)"
    echo -e "8) Keluar dari Script"
    echo -e "${CYAN}-----------------------------------------------------------------${NC}"
    read -p "Pilih menu [1-8]: " choice
    
    case $choice in
        1) install_dependencies ;;
        2) configure_env ;;
        3) start_app ;;
        4) configure_ufw ;;
        5) view_status ;;
        6) view_logs ;;
        7) stop_app ;;
        8) 
            echo -e "\n${GREEN}Terima kasih telah menggunakan Kasirku POS Deployment Wizard!${NC}"
            exit 0
            ;;
        *)
            echo -e "\n${RED}Pilihan tidak valid! Silakan pilih antara 1-8.${NC}"
            sleep 1.5
            ;;
    esac
done
