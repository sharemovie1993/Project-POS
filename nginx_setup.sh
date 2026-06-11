#!/bin/bash

# =================================================================
# 🌐 KASIRKU POS NGINX VIRTUAL HOST GENERATOR (FOR VPS PROXY)
# =================================================================
# Script ini digunakan di VPS untuk mengotomatiskan setup reverse
# proxy Nginx yang mengarah ke PC Lokal Toko melalui WireGuard.
# =================================================================

# Warna output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear
echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}        🌐 KASIRKU POS NGINX REVERSE PROXY SETUP WIZARD 🌐         ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo -e "Script ini akan membuat konfigurasi virtual host Nginx baru di VPS ini."
echo -e "${CYAN}-----------------------------------------------------------------${NC}"

# Cek apakah Nginx terinstall
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}[ERROR] Nginx tidak ditemukan di VPS ini. Silakan install Nginx terlebih dahulu.${NC}"
    echo -e "Cara install: sudo apt update && sudo apt install nginx -y"
    exit 1
fi

# 1. Input Domain
echo -e "${YELLOW}Langkah 1: Masukkan Nama Domain / Subdomain Anda${NC}"
echo -e "Contoh: kasir.tokosaya.com atau pos.domainku.id"
read -p "Domain: " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}[ERROR] Domain tidak boleh kosong! Proses dibatalkan.${NC}"
    exit 1
fi

# 2. Input Backend WireGuard IP
echo -e "\n${YELLOW}Langkah 2: Masukkan IP Wireguard & Port PC Lokal Toko Anda${NC}"
echo -e "Contoh: http://10.0.0.2:3000"
read -p "Backend URL [http://10.0.0.2:3000]: " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-"http://10.0.0.2:3000"}

# Buat berkas konfigurasi Nginx
CONFIG_FILE="/etc/nginx/sites-available/$DOMAIN_NAME"
SYMLINK_FILE="/etc/nginx/sites-enabled/$DOMAIN_NAME"

echo -e "\n${CYAN}Membuat file konfigurasi Nginx di: $CONFIG_FILE...${NC}"

# Tulis Nginx Server Block
sudo bash -c "cat <<EOF > $CONFIG_FILE
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Log files (opsional)
    access_log /var/log/nginx/${DOMAIN_NAME}_access.log;
    error_log /var/log/nginx/${DOMAIN_NAME}_error.log;

    location / {
        proxy_pass $BACKEND_URL;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Mendukung koneksi WebSockets jika diperlukan di masa depan
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
EOF"

# Buat Symlink ke sites-enabled jika belum ada
if [ ! -L "$SYMLINK_FILE" ]; then
    echo -e "${CYAN}Mengaktifkan virtual host dengan membuat symlink ke sites-enabled...${NC}"
    sudo ln -s "$CONFIG_FILE" "$SYMLINK_FILE"
fi

# Tes Konfigurasi Nginx
echo -e "\n${YELLOW}Menguji konfigurasi Nginx (nginx -t)...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}Konfigurasi Nginx valid! Memuat ulang (reload) Nginx...${NC}"
    sudo systemctl reload nginx
    echo -e "${GREEN}[SUKSES] Nginx berhasil di-reload!${NC}"
else
    echo -e "${RED}[ERROR] Konfigurasi Nginx tidak valid! Membatalkan reload.${NC}"
    echo -e "Silakan periksa kembali file: $CONFIG_FILE"
    exit 1
fi

# 3. Opsional Let's Encrypt / SSL Setup
echo -e "\n${CYAN}=================================================================${NC}"
echo -e "${YELLOW}Langkah 3: Setup SSL / HTTPS Gratis dengan Let's Encrypt (Opsional)${NC}"
echo -e "Sangat disarankan menggunakan HTTPS agar transaksi aman dari penyadapan."
read -p "Apakah Anda ingin memasang SSL Certbot untuk domain $DOMAIN_NAME? (y/n): " INSTALL_SSL

if [ "$INSTALL_SSL" = "y" ] || [ "$INSTALL_SSL" = "Y" ]; then
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}Certbot belum terinstall. Mengunduh certbot...${NC}"
        sudo apt update && sudo apt install certbot python3-certbot-nginx -y
    fi
    
    echo -e "${CYAN}Menjalankan Certbot untuk memperoleh sertifikat SSL...${NC}"
    # Pastikan domain sudah diarahkan ke IP publik VPS Anda sebelum menjalankan perintah ini!
    sudo certbot --nginx -d "$DOMAIN_NAME"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[SUKSES] SSL HTTPS Let's Encrypt berhasil dipasang untuk $DOMAIN_NAME!${NC}"
    else
        echo -e "${RED}[GAGAL] Certbot gagal memverifikasi domain Anda.${NC}"
        echo -e "Pastikan DNS domain Anda sudah terarah ke IP Publik VPS ini terlebih dahulu.${NC}"
    fi
fi

echo -e "\n${GREEN}=================================================================${NC}"
echo -e "🎉 KASIRKU POS NGINX REVERSE PROXY BERHASIL DIKONFIGURASI! 🎉"
echo -e "Akses Domain: ${CYAN}http://$DOMAIN_NAME${NC} (atau https jika SSL aktif)"
echo -e "Meneruskan ke : ${CYAN}$BACKEND_URL (WireGuard PC Lokal Toko)${NC}"
echo -e "=================================================================${NC}"
