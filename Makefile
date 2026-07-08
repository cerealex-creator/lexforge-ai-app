.PHONY: help up down db-only migrate seed api web dev install install-api install-web \
        venv setup clean test-api db-reset

ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Prefer 3.12 (stable), then 3.13
PYTHON_BIN := $(shell command -v python3.12 2>/dev/null || command -v python3.13 2>/dev/null || echo python3)
PYTHON := .venv/bin/python
PIP := .venv/bin/pip
UVICORN := .venv/bin/uvicorn
ALEMBIC := .venv/bin/alembic
ROOT := $(CURDIR)

help: ## Показать справку
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: db-only ## Запустить PostgreSQL + Redis и применить миграции
	@echo "Ожидание PostgreSQL..."
	@sleep 4
	@$(MAKE) migrate

down: ## Остановить Docker-сервисы
	docker compose down

db-only: ## Только postgres + redis в Docker
	docker compose up -d postgres redis

logs: ## Логи Docker
	docker compose logs -f

venv: ## Создать Python venv (Python 3.12–3.13)
	$(PYTHON_BIN) -m venv .venv
	$(PIP) install --upgrade pip

install-api: venv ## Установить зависимости backend
	$(PIP) install -r apps/api/requirements.txt

install-web: ## Установить зависимости frontend
	cd apps/web && npm install

install: install-api install-web ## Установить все зависимости

migrate: ## Применить миграции Alembic
	cd packages/db && PYTHONPATH=$(ROOT) $(ROOT)/$(ALEMBIC) -c alembic.ini upgrade head

seed: ## Загрузить seed-данные
	PYTHONPATH=$(ROOT) $(PYTHON) scripts/seed_data.py

db-reset: ## Сброс схемы БД + миграции + seed (исправляет частично применённые миграции)
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-lexforge} -d $${POSTGRES_DB:-lexforge} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
	@$(MAKE) migrate
	@$(MAKE) seed

api-stop: ## Остановить все процессы на порту API (8000)
	@pids=$$(lsof -ti tcp:$${API_PORT:-8000} 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "Останавливаем старый API (PID: $$pids)..."; \
		kill $$pids 2>/dev/null || true; \
		sleep 1; \
	else \
		echo "Порт $${API_PORT:-8000} свободен."; \
	fi

api: ## Запустить FastAPI (без Docker)
	@$(MAKE) api-stop
	cd apps/api && PYTHONPATH=$(ROOT) ../../$(UVICORN) main:app --reload --host $${API_HOST:-0.0.0.0} --port $${API_PORT:-8000}

web: ## Запустить Next.js (без Docker)
	cd apps/web && npm run dev

dev: ## Подсказка по запуску
	@echo "Терминал 1: make api          (или make api-stop && make api)"
	@echo "Терминал 2: make web"
	@echo "Frontend: http://localhost:3000"
	@echo "API docs:  http://localhost:8000/docs"

setup: install up seed ## Полная настройка
	@echo ""
	@echo "Готово! Запустите: make api  и  make web"
	@echo "Логин: admin@lexforge.ru / admin123"

clean: ## Очистить артефакты
	rm -rf .venv apps/web/.next apps/web/node_modules
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

test-api: ## Health check
	curl -s http://localhost:8000/health | python3 -m json.tool

test-llm: ## Проверить ключ RouterAI/OpenAI из .env
	PYTHONPATH=$(ROOT) $(PYTHON) scripts/test_llm.py
