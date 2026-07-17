# LexForge AI — Prototype

Корпоративный LegalTech AI-ассистент для юридического отдела.  
Оптимизирован для **MacBook M1, 8 GB RAM**.

## Стек

- **Frontend:** Next.js 15, TypeScript, Tailwind, Zustand, TanStack Query
- **Backend:** FastAPI, SQLAlchemy, JWT
- **БД:** PostgreSQL 16 + pgvector, Redis 7
- **LLM:** RouterAI API (Qwen3.x) — Phase 3+

## Быстрый старт

> **Python:** используйте 3.12 или 3.13 (`python3.13 -m venv .venv`). Python 3.14 пока не поддерживается зависимостями.

### 1. Подготовка

```bash
cp .env.example .env
# Заполните ROUTERAI_API_KEY при работе с AI (Phase 3+)
```

### 2. Вариант A — Docker только для БД (рекомендуется, экономия RAM)

```bash
make setup          # install + docker up + migrate + seed
```

В двух терминалах:

```bash
make api            # http://localhost:8000
make web            # http://localhost:3000
```

### 3. Вариант B — Homebrew (без Docker)

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

# Создать БД и расширение pgvector
createdb lexforge
psql lexforge -c "CREATE EXTENSION IF NOT EXISTS vector;"

make install migrate seed
make api
make web
```

## Демо-аккаунт

| Email | Пароль |
|-------|--------|
| admin@lexforge.ru | admin123 |

Две демо-компании создаются автоматически при `make seed`.

## API

- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

### Endpoints (Phase 0)

| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/v1/auth/login` | Вход |
| POST | `/api/v1/auth/register` | Регистрация |
| GET | `/api/v1/auth/me` | Текущий пользователь |
| GET | `/api/v1/companies` | Список компаний |
| POST | `/api/v1/companies` | Создать компанию (admin) |

## Структура проекта

```
apps/api/          FastAPI backend
apps/web/          Next.js frontend
packages/db/       SQLAlchemy + Alembic
scripts/           Seed-скрипты
uploads/           Локальное хранилище файлов
```

## RAM budget (~1.5 GB под приложение)

| Сервис | RAM |
|--------|-----|
| PostgreSQL (Docker) | ~512 MB |
| Redis (Docker) | ~256 MB |
| FastAPI | ~150 MB |
| Next.js dev | ~400 MB |

Backend и Frontend **не** запускаются в Docker — только PG + Redis.

### Ошибка миграций (`No module named 'packages'` / `psycopg2`)

```bash
pip install -r apps/api/requirements.txt   # включает psycopg2-binary
make migrate
```

Если миграция прервалась и таблицы не созданы, но Alembic считает её применённой:

```bash
make db-reset    # полный сброс схемы + migrate + seed (Docker должен быть запущен)
```

Или вручную:

```bash
cd packages/db
PYTHONPATH=../.. alembic -c alembic.ini stamp base
PYTHONPATH=../.. alembic -c alembic.ini upgrade head
cd ../.. && make seed
```

### Docker не запущен

```bash
open -a Docker    # запустить Docker Desktop
make up
```

### Python 3.14

Используйте Python 3.12 или 3.13: `python3.12 -m venv .venv`

## Roadmap

- [x] **Phase 0:** Auth, companies, dashboard
- [ ] **Phase 1:** Upload docx/pdf, TipTap preview
- [ ] **Phase 2:** Prompt Management Center
- [ ] **Phase 3:** Contract Review (RouterAI)
- [ ] **Phase 4:** Reference docs + pgvector RAG
- [ ] **Phase 5:** Due Diligence, deadlines

## Команды Makefile

```bash
make help      # Справка
make up        # Docker PG+Redis + migrate
make api       # Backend
make web       # Frontend
make seed      # Демо-данные
make migrate   # Alembic upgrade
```

## Деплой на сервер

См. подробную инструкцию: [`docs/DEPLOY.md`](docs/DEPLOY.md)

Кратко: подготовка Ubuntu → `.env` → `bash deploy/scripts/first-deploy.sh`.
Обновления: `git pull && bash deploy/scripts/update.sh`.
Регистрация пользователей: `/register`.
