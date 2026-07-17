#!/usr/bin/env bash
# First-time server preparation (Ubuntu).
# Run as root: bash deploy/scripts/setup-server.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите от root: sudo bash deploy/scripts/setup-server.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Система и пакеты"
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg git nginx ufw \
  python3 python3-venv python3-pip \
  build-essential libpq-dev software-properties-common

# LexForge needs Python 3.12 (not 3.14 from Ubuntu 26.04 — pydantic/pyo3 unsupported yet)
if ! command -v python3.12 >/dev/null 2>&1; then
  echo "==> Установка Python 3.12 (deadsnakes)"
  add-apt-repository -y ppa:deadsnakes/ppa
  apt-get update -y
  apt-get install -y python3.12 python3.12-venv python3.12-dev
fi
python3.12 --version

# Node.js 20 LTS
if ! command -v node >/dev/null 2>&1; then
  echo "==> Установка Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Установка Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# Docker Compose plugin
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

# Swap 2G (helps next build on 4GB RAM)
if [[ ! -f /swapfile ]]; then
  echo "==> Создание swap 2G"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

# App user
if ! id lexforge >/dev/null 2>&1; then
  echo "==> Пользователь lexforge"
  useradd --system --create-home --home-dir /opt/lexforge --shell /bin/bash lexforge
fi

mkdir -p /opt/lexforge
chown -R lexforge:lexforge /opt/lexforge
usermod -aG docker lexforge || true

# Firewall: SSH + HTTP (+ HTTPS for later)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable || true

echo ""
echo "Готово. Дальше:"
echo "  1) Войдите как lexforge или скопируйте репозиторий в /opt/lexforge"
echo "  2) Заполните .env"
echo "  3) Запустите: bash deploy/scripts/first-deploy.sh"
