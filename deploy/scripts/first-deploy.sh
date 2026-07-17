#!/usr/bin/env bash
# First deploy of LexForge on the prepared Ubuntu server.
# Run as user lexforge from /opt/lexforge:
#   bash deploy/scripts/first-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Нет файла .env"
  echo "Скопируйте шаблон и заполните секреты:"
  echo "  cp deploy/env.production.example .env"
  echo "  nano .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ "${APP_SECRET_KEY}" == *"CHANGE_ME"* ]] || [[ "${JWT_SECRET_KEY}" == *"CHANGE_ME"* ]]; then
  echo "Сначала замените APP_SECRET_KEY и JWT_SECRET_KEY в .env"
  echo "Можно сгенерировать: openssl rand -hex 32"
  exit 1
fi

if [[ "${POSTGRES_PASSWORD}" == *"CHANGE_ME"* ]]; then
  echo "Замените POSTGRES_PASSWORD в .env (и в DATABASE_URL / DATABASE_URL_SYNC)"
  exit 1
fi

echo "==> PostgreSQL + Redis"
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d
sleep 5

echo "==> Python venv + зависимости API"
if [[ ! -d .venv ]]; then
  python3.12 -m venv .venv || python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r apps/api/requirements.txt

echo "==> Миграции и seed admin"
cd packages/db
PYTHONPATH="$ROOT" "$ROOT/.venv/bin/alembic" -c alembic.ini upgrade head
cd "$ROOT"
PYTHONPATH="$ROOT" .venv/bin/python scripts/seed_data.py

mkdir -p uploads
chmod 755 uploads

echo "==> Frontend: npm install + production build"
cd apps/web
npm ci || npm install
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1}"
npm run build
cd "$ROOT"

echo "==> systemd + nginx"
if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

$SUDO cp deploy/systemd/lexforge-api.service /etc/systemd/system/
$SUDO cp deploy/systemd/lexforge-web.service /etc/systemd/system/
$SUDO cp deploy/nginx/lexforge.conf /etc/nginx/sites-available/lexforge
$SUDO ln -sfn /etc/nginx/sites-available/lexforge /etc/nginx/sites-enabled/lexforge
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now lexforge-api lexforge-web
$SUDO systemctl reload nginx

echo ""
echo "Деплой завершён."
echo "Откройте: ${WEB_URL:-http://SERVER_IP}"
echo "Регистрация: ${WEB_URL:-http://SERVER_IP}/register"
echo "Вход seed-admin: ${SEED_ADMIN_EMAIL:-admin@lexforge.ru}"
echo ""
echo "Обновление кода позже: bash deploy/scripts/update.sh"
