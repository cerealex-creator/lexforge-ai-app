#!/usr/bin/env bash
# Update LexForge on the server after code changes.
# From /opt/lexforge as user lexforge:
#   bash deploy/scripts/update.sh
#
# Typical workflow from your Mac:
#   1) commit + push locally
#   2) on server: cd /opt/lexforge && git pull && bash deploy/scripts/update.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

if [[ ! -f .env ]]; then
  echo "Нет .env в $ROOT"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

echo "==> git pull (если это git-репозиторий)"
if [[ -d .git ]]; then
  git pull --ff-only
else
  echo "Каталог не git — пропускаем pull (скопируйте файлы вручную)."
fi

echo "==> Postgres/Redis"
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d

echo "==> Python dependencies + migrations"
if ! command -v python3.12 >/dev/null 2>&1; then
  echo "Нужен Python 3.12 (см. docs/DEPLOY.md)"
  exit 1
fi
if [[ -d .venv ]]; then
  VENV_PY="$(".venv/bin/python" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "?")"
  if [[ "$VENV_PY" != "3.12" ]]; then
    echo "Пересоздаю .venv (было Python $VENV_PY, нужно 3.12)"
    rm -rf .venv
  fi
fi
if [[ ! -d .venv ]]; then
  python3.12 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r apps/api/requirements.txt
cd packages/db
PYTHONPATH="$ROOT" "$ROOT/.venv/bin/alembic" -c alembic.ini upgrade head
cd "$ROOT"

echo "==> Frontend rebuild"
cd apps/web
npm ci || npm install
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1}"
npm run build
cd "$ROOT"

echo "==> Restart services"
$SUDO systemctl restart lexforge-api lexforge-web
$SUDO systemctl reload nginx || true

echo "==> Health"
sleep 2
curl -fsS "http://127.0.0.1:8000/health" | .venv/bin/python -m json.tool || true

echo ""
echo "Обновление завершено."
echo "Проверьте сайт: ${WEB_URL:-http://SERVER_IP}"
