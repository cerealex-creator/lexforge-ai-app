# LexForge AI — Журнал работ

Хронологический лог выполненных задач. Каждая запись привязана к запросу пользователя.

**Формат записи:**
```
## YYYY-MM-DD — Краткий заголовок
**Запрос:** ...
**Сделано:** ...
**Файлы/артефакты:** ...
**Статус:** ...
**Следующий шаг:** ...
```

---

## 2026-06-23 — Архитектурный proposal (enterprise)

**Запрос:** Комплексная техническая архитектура LegalTech-приложения LexForge: стек, схема БД, агенты, Prompt Management Center, Reference Documents Pipeline, план реализации.

**Сделано:**
- Предложен полный стек (Next.js, FastAPI, PostgreSQL, Qdrant, LangGraph, OnlyOffice, Keycloak и др.)
- Концептуальная схема БД: multi-tenancy, prompts, reference documents, vector collections
- Workflow ИИ-агентов (15 агентов, fan-out, merger, track changes)
- Архитектура Prompt Management Center и Reference Documents Pipeline
- План реализации Phase 0–5
- Риски и митигация

**Файлы/артефакты:** `.cursor/plans/lexforge_architecture_proposal_9b5ebb09.plan.md`

**Статус:** Принято пользователем как базовая enterprise-архитектура.

**Следующий шаг:** Доработка узких мест.

---

## 2026-06-23 — Production Deep-Dive (10 критических пунктов)

**Запрос:** Детальные технические решения по 10 узким местам: OnlyOffice, diff engine, Result Merger, PII, token budget, map-reduce, Temporal vs Celery, A/B тесты, graceful degradation, seed vs UI.

**Сделано:**
- Раздел 9 в архитектурном плане с псевдокодом, JSON-схемами, mermaid-диаграммами
- OnlyOffice: 3-уровневый fallback, лицензирование Enterprise
- Diff engine: 3-phase clause alignment, risk delta
- Result Merger: weighted 75th percentile, дедупликация, conflict resolution
- PII: selective anonymization + token vault
- Token budget для русского: ~chars/2.6, truncation priority
- Map-reduce: overlap + cross-section agent
- Celery-only до Phase 5; Temporal опционально
- A/B: composite score, Bayesian winner
- Graceful degradation matrix
- Seed/UI sync: DB as source of truth

**Файлы/артефакты:** обновлён `lexforge_architecture_proposal_9b5ebb09.plan.md` (секция 9–10)

**Статус:** Завершено (план).

---

## 2026-06-23 — Спецификация прототипа (8 GB RAM, RouterAI)

**Запрос:** Рабочий прототип под MacBook M1 8GB: pgvector вместо Qdrant, RouterAI/Qwen3.7, без Ollama/OnlyOffice/Keycloak; план Phase 0–5 за 7–10 дней.

**Сделано:**
- Адаптированный стек и структура `lexforge-prototype/`
- docker-compose только postgres + redis
- .env.example, Makefile, Phase 0 спецификация
- Секция 10 в архитектурном плане

**Файлы/артефакты:** план (секция 10), прототип todos

**Статус:** Спецификация готова; реализация запрошена отдельно.

---

## 2026-06-23 — Реализация Phase 0 (прототип)

**Запрос:** «Создай прототип Phase 0» — структура, миграции, JWT, базовый UI.

**Сделано:**
- Структура monorepo: `apps/api`, `apps/web`, `packages/db`, `services/`, `scripts/`, `uploads/`
- `docker-compose.yml` — PostgreSQL 16 + pgvector, Redis (лимиты RAM)
- `.env.example`, `.gitignore`, `Makefile`, `README.md`
- Alembic migration `001_initial`: users, companies, user_company_roles, document_chunks + vector(1536)
- FastAPI: JWT auth (login/register/me), companies CRUD, CORS
- `scripts/seed_data.py` — admin + 2 демо-компании
- Next.js 15: `/login`, `/dashboard`, company switcher, AuthGuard, zustand
- Проверка: FastAPI import OK, `npm run build` успешен
- Python 3.13 для venv (3.14 не поддерживается pydantic)

**Файлы/артефакты:**
- `apps/api/main.py`, `routers/auth.py`, `routers/companies.py`, `config.py`, `database.py`, `dependencies.py`, `schemas.py`
- `packages/db/models.py`, `migrations/versions/001_initial.py`
- `apps/web/src/app/login/page.tsx`, `dashboard/page.tsx`, компоненты UI
- `scripts/seed_data.py`

**Статус:** Phase 0 завершён в коде. Docker/migrate не запускались в среде агента (нет docker).

**Следующий шаг:** Phase 1 — загрузка docx/pdf, парсинг, TipTap preview.

---

## 2026-06-23 — Журнал работ и правило ведения контекста

**Запрос:** Создать журнал и правило заносить в журнал всё сделанное и в ответ на какой запрос.

**Сделано:**
- Создан `docs/WORK_JOURNAL.md` с ретроспективными записями
- Создано правило `.cursor/rules/work-journal.mdc` (alwaysApply)

**Файлы/артефакты:** `docs/WORK_JOURNAL.md`, `.cursor/rules/work-journal.mdc`

**Статус:** Завершено.

**Следующий шаг:** По запросу пользователя — Phase 1 или иные задачи.

---

## 2026-07-06 — Исправление setup (миграции, psycopg2, PYTHONPATH)

**Запрос:** Посмотреть терминал пользователя и исправить, чтобы `make setup` работал.

**Сделано:**
- Добавлен `psycopg2-binary` в `apps/api/requirements.txt` (Alembic требует sync-драйвер)
- Исправлен `packages/db/migrations/env.py`: корректный ROOT (`../../..`), загрузка `.env`
- Исправлена миграция `001_initial`: idempotent `user_role` enum (`create_type=False` + DO block)
- Makefile: `PYTHONPATH=$(ROOT)` для migrate/seed/api; `migrate` с `-c alembic.ini`
- Добавлена команда `make db-reset` для восстановления после частичной миграции
- Создан `packages/__init__.py`
- Pin `bcrypt==4.1.3` (совместимость с passlib)
- README: секция troubleshooting
- Выполнено локально: `stamp base` → `upgrade head` → seed OK

**Файлы/артефакты:** `Makefile`, `env.py`, `001_initial.py`, `requirements.txt`, `README.md`, `packages/__init__.py`

**Статус:** Завершено. Пользователю: `make db-reset` или `make migrate && make seed`, затем `make api` + `make web`.

**Следующий шаг:** Phase 1 — документы.

---

## 2026-07-06 — Исправление входа (email .local + [object Object])

**Запрос:** «Не могу зайти» — на форме логина ошибка `[object Object]`.

**Сделано:**
- Причина: `admin@lexforge.local` отклоняется Pydantic `EmailStr` (422), фронт не парсил `detail`-массив
- Демо-email заменён на `admin@lexforge.ru` (seed, .env, login UI, README)
- `api.ts`: `formatApiDetail()` — человекочитаемые ошибки API
- `seed_data.py`: миграция старого `admin@lexforge.local` → `admin@lexforge.ru`
- Seed выполнен: email в БД обновлён

**Файлы/артефакты:** `api.ts`, `login/page.tsx`, `seed_data.py`, `.env`, `.env.example`, README, Makefile

**Статус:** Завершено.

**Следующий шаг:** Перезапустить `make web`, войти как `admin@lexforge.ru` / `admin123`.

---

## 2026-07-06 — Реструктуризация UI по mind map

**Запрос:** Due Diligence на русском; трекер сроков и промпты — вспомогательные; главное меню по схеме (договорная / консультирование / судебная) + специализация (стройка, производство, поставки).

**Сделано:**
- Новая IA: `navigation.ts` — 3 раздела юридической работы, auxiliary в Настройках
- «Проверка контрагента» и «Сроки» — встроены в договорную работу, не top-level
- Селектор направления: Строительство / Производство / Поставки / Универсальное
- `AppShell` с боковым меню + страница `/settings`
- Обновлён dashboard

**Файлы/артефакты:** `navigation.ts`, `app-shell.tsx`, `industry-selector.tsx`, `dashboard/page.tsx`, `settings/page.tsx`

**Статус:** Завершено (UI prototype).

**Следующий шаг:** Phase 1 — первый рабочий модуль «Проверка договора».

---

## 2026-07-06 — Модуль «Проверка договора» (MVP)

**Запрос:** «Давай следующий шаг» после реструктуризации UI.

**Сделано:**
- Миграция 002: documents, document_versions, document_tasks, task_results
- Парсинг docx/pdf/txt (python-docx, PyMuPDF)
- API: POST /documents/upload, POST /reviews, GET /reviews/{id}
- RouterAI через OpenAI SDK (json_object mode)
- Страница `/contracts/review`: загрузка, 3 режима, комментарий, polling, результаты
- Включён пункт меню «Проверка договора»

**Файлы:** migration 002, routers/documents.py, reviews.py, services/*, contracts/review/page.tsx

**Запуск:** `make migrate` → `make api` + `make web` → ROUTERAI_API_KEY в .env

**Следующий шаг:** Опорные документы, экспорт docx, Prompt Management UI.

---

## 2026-07-07 — Prompt Management UI (MVP)

**Запрос:** «делай дальше» после выбора Prompt Management UI из предложенных вариантов (экспорт docx / промпты / опорные документы).

**Сделано:**
- Миграция `003_prompt_overrides`: таблица `prompt_overrides` (key PK, content, updated_by, updated_at)
- `services/prompt_engine/registry.py` — закрытый реестр редактируемых промптов: базовый системный промпт (с плейсхолдерами `$industry_label`, `$company_name`, `$mode_instruction`), 3 режима проверки, 4 отрасли; в реестре же дефолтные значения (то, что раньше было захардкожено)
- `services/prompt_engine/prompt_service.py` — `get_prompt_map()`: override из БД, иначе дефолт из реестра
- `review_prompts.py` переведён на `string.Template.safe_substitute` (не конфликтует с фигурными скобками JSON-схемы в системном промпте)
- `reviewer.py` подтягивает промпты через `get_prompt_map()` перед вызовом LLM
- API `apps/api/routers/prompts.py`: `GET /api/v1/prompts`, `PUT /api/v1/prompts/{key}`, `POST /api/v1/prompts/{key}/reset` — запись доступна только через существующий `require_admin`
- `/health` → v0.3.0, добавлен `modules.prompts`
- Фронтенд: `promptApi` в `api.ts`; страница `/settings/prompts` — редактирование по группам (базовый / режимы / отрасли), бейдж «Изменено», кнопки Сохранить/Сбросить; пункт меню включён (`enabled: true`)
- `settings/page.tsx`: включённые auxiliary-инструменты теперь ведут по ссылке, а не просто disabled-кнопка

**Файлы:** `packages/db/models.py` (PromptOverride), `migrations/versions/003_prompt_overrides.py`, `services/prompt_engine/registry.py`, `prompt_service.py`, `review_prompts.py`, `services/ai_orchestrator/reviewer.py`, `apps/api/routers/prompts.py`, `apps/api/main.py`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/navigation.ts`, `apps/web/src/app/settings/page.tsx`, `apps/web/src/app/settings/prompts/page.tsx`

**Проверено:** `make migrate` применил 003; curl-тест `GET/PUT/POST reset /api/v1/prompts` — override создаётся и корректно сбрасывается; `tsc --noEmit` без ошибок.

**Статус:** Завершено.

**Следующий шаг:** Экспорт результатов проверки в .docx; опорные документы (типовые шаблоны для сравнения).

---

## 2026-07-07 — Экспорт заключения проверки в .docx

**Запрос:** «делаем дальше» → выбран вариант «Экспорт результатов проверки в .docx» из предложенных.

**Сделано:**
- `services/document_processor/exporter.py` — `build_review_report()`: генерирует Word-документ (python-docx) с заголовком, метаданными (документ/компания/режим/отрасль/дата), оценкой риска с цветовой индикацией, таблицей замечаний (№/пункт/критичность с заливкой/цитата+обоснование/рекомендация)
- API: `GET /api/v1/reviews/{task_id}/export?company_id=...` в `reviews.py` — `StreamingResponse` с корректным `Content-Disposition` (RFC 5987, кириллица в имени файла через `filename*=UTF-8''...`), 400 если проверка не завершена
- Frontend: `reviewApi.exportReview()` в `api.ts` (fetch + blob, т.к. нужен Authorization-заголовок); кнопка «Скачать заключение (.docx)» на странице результатов, скачивание через `URL.createObjectURL`

**Файлы:** `services/document_processor/exporter.py`, `apps/api/routers/reviews.py`, `apps/web/src/lib/api.ts`, `apps/web/src/app/contracts/review/page.tsx`

**Проверено:** Полный E2E через curl — upload → review (risk_score 9, 3 замечания) → export → валидный .docx (38 КБ), таблица 4×5 с корректными данными, кириллица в имени файла. `tsc --noEmit` без ошибок.

**Статус:** Завершено.

**Следующий шаг:** Опорные документы (типовые шаблоны для сравнения) или Картотека документов (архив по компаниям).

---

## 2026-07-07 — Сравнение версий/редакций договора (новый модуль в план + MVP)

**Запрос:** «Нужно также предусмотреть сравнительный анализ версий/редакций договоров. Если этого нет в плане — включи и запланируй. Делай следующий этап, какой считаешь нужным».

**Планирование:** Модуль добавлен в `navigation.ts` под «Договорная работа» рядом с «Проверка договора» — закрывает пробел в дорожной карте (ранее в mind map фигурировала только проверка договора целиком, без сравнения редакций/переговорных итераций).

**Архитектурное решение:** Не привязано к `DocumentVersion` одного документа (это для истории правок одного файла), а сравнивает **два независимых загруженных документа** — типичный кейс: наш шаблон vs редакция от контрагента. Отдельная модель, не переиспользует `DocumentTask`/`TaskResult` (другая форма результата: `changes` вместо `findings`, `risk_delta` −5..+5 вместо `risk_score` 1-10).

**Сделано:**
- Миграция `004_comparison_tasks`: таблицы `comparison_tasks` (base/revised document, переиспользует enum `task_status`), `comparison_results` (`risk_delta`, `result_json`)
- `services/document_processor/diff_engine.py` — постраничный diff (`difflib.SequenceMatcher` по параграфам), в LLM отправляются **только изменённые фрагменты** (БЫЛО/СТАЛО), не весь текст обоих документов — экономит токены на длинных договорах с точечными правками
- Промпт `version_comparison.system_base` добавлен в реестр Prompt Management (редактируется в той же админке, что и промпты проверки договора)
- `services/ai_orchestrator/comparator.py` — оркестрация: diff → промпт → RouterAI → сохранение; если diff пустой (документы идентичны) — LLM не вызывается, сразу `risk_delta=0`
- API: `POST /api/v1/comparisons`, `GET /api/v1/comparisons/{id}` в `apps/api/routers/comparisons.py` (тот же паттерн `sa_inspect(...).loaded_value`, что и в `reviews.py`, чтобы не наступить на `MissingGreenlet`)
- `/health` → v0.4.0, `modules.comparisons`
- Frontend: `comparisonApi` в `api.ts`; страница `/contracts/compare` — два слота загрузки (базовая/новая редакция), комментарий, polling, результаты с сеткой «Было/Стало», бейджи impact (выгодно/невыгодно/подозрительно) и severity
- Группа «Сравнение версий / редакций» добавлена в `/settings/prompts`

**Файлы:** `packages/db/models.py` (ComparisonTask, ComparisonResult), `migrations/versions/004_comparison_tasks.py`, `services/document_processor/diff_engine.py`, `services/prompt_engine/registry.py`, `comparison_prompts.py`, `services/ai_orchestrator/comparator.py`, `apps/api/schemas_comparison.py`, `routers/comparisons.py`, `apps/api/main.py`, `apps/web/src/lib/api.ts`, `navigation.ts`, `app/contracts/compare/page.tsx`, `app/settings/prompts/page.tsx`

**Проверено:** Полный E2E через curl — два документа с 3 изменёнными пунктами (аванс 20%→80%, срок оплаты 5 дней→1 день, добавлен п. о невозврате аванса) и 1 неизменённым; RouterAI корректно нашёл ровно 2 существенных изменения (diff engine верно проигнорировал неизменённые пункты), вернул `risk_delta: -5`, точные ссылки на риски для заказчика. `tsc --noEmit` и линтер — без ошибок.

**Статус:** Завершено.

**Следующий шаг:** Опорные документы (типовые шаблоны/чек-листы для сравнения) или Картотека документов (архив по компаниям).

---

## 2026-07-07 — Картотека документов

**Запрос:** «продолжай с любого этапа» — выбрана Картотека документов как логичное завершение уже built-функционала (upload → review → compare теперь видны в одном архиве).

**Сделано:**
- API: `GET /api/v1/documents?company_id=...` — список документов компании с агрегатами: количество проверок, статус и risk_score последней проверки (без N+1: два batched-запроса по `document_id.in_(...)`)
- API: `GET /api/v1/documents/{id}/download` — отдаёт исходный загруженный файл (`FileResponse`, оригинальное имя и mime-type)
- Frontend: `documentApi` в `api.ts`; страница `/documents` — список карточек по документам: дата, кол-во слов, кол-во проверок, бейдж статуса/risk_score последней проверки, кнопки «Оригинал» (скачать файл) и «Заключение» (скачать .docx-отчёт последней завершённой проверки — переиспользует `reviewApi.exportReview`)
- Пункт меню «Картотека документов» включён (`Phase 1` → `MVP`, `enabled: true`)

**Файлы:** `apps/api/schemas_review.py` (DocumentListItemOut), `apps/api/routers/documents.py`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/navigation.ts`, `apps/web/src/app/documents/page.tsx`

**Проверено:** curl-тест списка и скачивания — картотека корректно показала все реальные документы, загруженные пользователем ранее вручную (включая договор с 7 проверками, risk_score 9), скачивание вернуло файл с правильным `Content-Disposition`. `tsc --noEmit` и линтер — без ошибок.

**Статус:** Завершено.

**Следующий шаг:** Опорные документы (типовые шаблоны/чек-листы для автоматического сравнения при проверке).

---

## 2026-07-06 — Fix: Not Found при проверке договора

**Запрос:** Скриншот с ошибкой «Not Found» на странице проверки.

**Причина:** Запущен старый процесс API (Phase 0) без маршрутов `/documents/upload` и `/reviews`.

**Сделано:** `/health` v0.2.0 с `modules.reviews`; предупреждение на странице; понятные ошибки 404; `apps/web/.env.local`.

**Действие пользователю:** Ctrl+C → `make api` → обновить страницу.

---

## 2026-07-07 — Fix: MissingGreenlet + диагностика RouterAI 401

**Запрос:** «Ошибка запуска проверки», затем «Error code: 401 - {'error': '401 Unauthorized'}».

**Причина 1:** В `reviews.py` при создании задачи код обращался к ленивой связи `task.result` в async-сессии SQLAlchemy → `MissingGreenlet`.

**Причина 2:** Ключ `ROUTERAI_API_KEY` в `.env` был невалиден/отозван (RouterAI напрямую возвращал 401). После создания нового ключа пользователь не сохранял файл (Cmd+S) — `make test-llm` продолжал читать старый ключ с диска.

**Сделано:**
- `reviews.py`: `_task_to_out` читает результат через `sa_inspect(task).attrs.result.loaded_value`, не триггерит ленивую загрузку
- `llm_client.py`: перехват `AuthenticationError` → понятная подсказка (API-ключ vs мастер-ключ)
- `scripts/test_llm.py` + `make test-llm`: диагностика ключа (отпечаток, mtime `.env`, отличие API-ключ/мастер-ключ) без вывода полного секрета
- `Makefile`: `make api-stop` — освобождает порт 8000 перед `make api` (чинит проблему двух одновременных процессов API старой/новой версии)

**Файлы:** `apps/api/routers/reviews.py`, `services/ai_orchestrator/llm_client.py`, `scripts/test_llm.py`, `Makefile`

**Статус:** Завершено. `make test-llm` → OK, ключ подтверждён, полный флоу (upload → review → RouterAI) работает.

**Следующий шаг:** Опорные документы, экспорт docx, Prompt Management UI.

---

## 2026-07-07 — Опорные документы (эталонные шаблоны/чек-листы компании)

**Запрос:** «продолжай с любого этапа» — реализовать последний пункт плана: возможность сравнивать проверяемый договор не только «сам с собой», но и с эталонными условиями компании (типовой шаблон, чек-лист обязательных условий, комплаенс-требования).

**Рефакторинг:** Логика сохранения+парсинга загруженного файла (`documents.py: upload_document`) вынесена в переиспользуемый сервис `services/document_processor/ingest.py::store_and_parse_upload()` — используется теперь и обычной загрузкой документа, и загрузкой опорного документа, без дублирования кода.

**Backend:**
- Модели: `ReferenceCategory` (standard_contract / checklist / compliance), `ReferenceDocument` (обёртка над `Document`+`DocumentVersion` с категорией, названием, описанием, флагом `is_active`); `DocumentTask.reference_document_id` (nullable FK) — на какую задачу проверки повлиял выбранный эталон.
- Миграция `005_reference_documents`: таблица `reference_documents`, enum `reference_category`, колонка `document_tasks.reference_document_id`.
- API `apps/api/routers/reference_documents.py`: `GET /api/v1/reference-documents` (список, фильтр `active_only`), `POST /upload` (multipart: файл + категория + название + описание), `PATCH /{id}` (переименование/категория/описание/активность), `DELETE /{id}`.
- Промпт-реестр: новый редактируемый промпт `contract_review.reference_instruction` — инструкция ИИ, как сравнивать договор с приложенным эталоном (добавляется к системному промпту только если выбран эталон).
- `review_prompts.build_review_prompt()`: принимает `reference_text`/`reference_instruction`, добавляет блок «ЭТАЛОННЫЙ ДОКУМЕНТ КОМПАНИИ» в начало user-промпта (лимит 20 000 символов с отметкой обрезки).
- `reviewer.py`: если у задачи указан `reference_document_id` — подгружает последнюю версию текста связанного документа и передаёт в промпт вместе с инструкцией.
- `ReviewCreateRequest`/`ReviewTaskOut`: новое поле `reference_document_id` (валидируется принадлежность компании).
- `/health` → `0.5.0`, `modules.reference_documents: true`.

**Frontend:**
- Новая страница `/settings/reference-documents`: загрузка файла (.docx/.pdf/.txt) с названием, категорией и описанием; список с бейджами категорий, переключение активности, удаление.
- Страница `/contracts/review`: опциональный шаг «Сравнить с эталоном компании» — выпадающий список активных опорных документов компании, передаётся как `reference_document_id` при запуске проверки.
- `Prompt Management UI` (`/settings/prompts`): новая группа «Сравнение с эталоном компании» для редактирования `contract_review.reference_instruction`.
- `navigation.ts`: пункт «Опорные документы» в `auxiliaryTools` (Настройки).
- `api.ts`: клиент `referenceApi` (list/upload/update/remove).

**Проверено:**
- E2E curl-флоу: загрузка эталонного договора поставки → загрузка проверяемого договора с намеренными отклонениями (срок поставки, предоплата 100%, отсутствие ответственности, укороченная гарантия) → запуск проверки с `reference_document_id` → ИИ вернул risk_score 9 и **все 4 замечания явно ссылаются на отклонение от эталона** («Отклонение от эталона (30 дней)», «Прямое нарушение комплаенс-требования эталона», «Сокращение гарантийного срока в 8 раз по сравнению с эталоном»).
- `PATCH`/`DELETE` на `reference-documents` — корректные коды (200/204), список обновляется.
- `npx tsc --noEmit` и `npx next build` — без ошибок, новая страница присутствует в билде.

**Файлы:** `packages/db/models.py`, `packages/db/migrations/versions/005_reference_documents.py`, `services/document_processor/ingest.py` (новый), `apps/api/routers/documents.py` (упрощён), `apps/api/routers/reference_documents.py` (новый), `apps/api/schemas_reference.py` (новый), `apps/api/schemas_review.py`, `apps/api/routers/reviews.py`, `services/prompt_engine/registry.py`, `services/prompt_engine/review_prompts.py`, `services/ai_orchestrator/reviewer.py`, `apps/api/main.py`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/navigation.ts`, `apps/web/src/app/settings/reference-documents/page.tsx` (новый), `apps/web/src/app/contracts/review/page.tsx`, `apps/web/src/app/settings/prompts/page.tsx`.

**Статус:** Завершено. Весь ранее запланированный MVP-функционал (проверка договора, промпт-менеджмент, экспорт .docx, сравнение версий/редакций, картотека документов, опорные документы) реализован и проверен end-to-end.

---

## 2026-07-07 — UX-доработки MVP: экспорт сравнения, история, выбор из картотеки

**Запрос:** «выбери по своему усмотрению и продолжай» — выбраны три связанных улучшения для юристов.

**Backend:**
- `build_comparison_report()` в `exporter.py` — генерация .docx по результатам сравнения редакций (метаданные, risk_delta, таблица изменений Было/Стало).
- `GET /api/v1/comparisons/{id}/export` — скачивание заключения по сравнению.
- `GET /api/v1/reviews?company_id=&limit=` — список последних проверок с названием документа и risk_score.
- `GET /api/v1/comparisons?company_id=&limit=` — список последних сравнений с названиями обеих редакций и risk_delta.
- Схемы `ReviewListItemOut`, `ComparisonListItemOut`.
- `/health` → `0.6.0`.

**Frontend:**
- Компонент `DocumentPicker` — переключатель «Загрузить» / «Из картотеки»; используется на `/contracts/review` и `/contracts/compare`.
- Страница сравнения: кнопка «Скачать заключение (.docx)» после завершения.
- Блок «Недавние задачи» на рабочем столе (`RecentActivity`) — объединённая лента проверок и сравнений.
- `api.ts`: `reviewApi.list`, `comparisonApi.list`, `comparisonApi.exportComparison`.

**Проверено:**
- `GET /reviews` и `GET /comparisons` возвращают историю с названиями документов.
- `GET /comparisons/{id}/export` → HTTP 200, валидный Microsoft OOXML (~38 KB).
- `npx tsc --noEmit` — без ошибок.

**Файлы:** `services/document_processor/exporter.py`, `apps/api/routers/comparisons.py`, `apps/api/routers/reviews.py`, `apps/api/schemas_comparison.py`, `apps/api/schemas_review.py`, `apps/web/src/components/document-picker.tsx` (новый), `apps/web/src/components/recent-activity.tsx` (новый), `apps/web/src/app/contracts/compare/page.tsx`, `apps/web/src/app/contracts/review/page.tsx`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/lib/api.ts`, `apps/api/main.py`.

**Статус:** Завершено.

---

## 2026-07-07 — Карточка документа и просмотр прошлых результатов

**Запрос:** «делай дальше» — связать картотеку, историю и просмотр результатов.

**Backend:**
- `GET /reviews?document_id=` — фильтр проверок по документу.
- `GET /comparisons?document_id=` — сравнения, где документ участвует как база или новая редакция.

**Frontend:**
- `/documents/[id]` — карточка документа: метаданные, фрагмент текста, история проверок и сравнений.
- `/contracts/review/[taskId]` и `/contracts/compare/[taskId]` — просмотр прошлых результатов с экспортом .docx.
- Компоненты `ReviewResultPanel`, `ComparisonResultPanel`.
- Кликабельные строки в «Недавних задачах»; в картотеке название ведёт на карточку.

**Статус:** Завершено.

---

## 2026-07-07 — Модуль «Сроки и обязательства» (API 0.7.0)

**Запрос:** «делай следующий этап» — извлечение сроков и обязательств из договора через LLM.

**Backend:**
- Модель `DeadlineExtraction` + миграция `006_deadline_extractions`.
- Промпт `deadline_extraction.system_base` в реестре.
- Сервис `run_deadline_extraction()` — парсинг JSON с категориями (payment, delivery, penalty, warranty и др.), сторонами и типами сроков.
- `POST /documents/{id}/deadlines/extract` (202, фоновая задача).
- `GET /documents/{id}/deadlines` — последнее извлечение.
- `GET /documents/{id}/deadlines/{extraction_id}` — статус и результат.
- `/health` → `0.7.0`, `modules.deadlines: true`.

**Frontend:**
- Компонент `DeadlinesPanel` на карточке документа: запуск извлечения, polling, таблица сроков.
- `deadlineApi` в `api.ts`.
- Группа «Сроки и обязательства» на `/settings/prompts`.

**Проверено:**
- E2E: извлечение завершилось за ~69 с, 4+ пункта (оплата, поставка, ответственность, гарантия).
- `npx tsc --noEmit` — без ошибок.

**Файлы:** `packages/db/models.py`, `packages/db/migrations/versions/006_deadline_extractions.py`, `apps/api/schemas_deadlines.py`, `services/ai_orchestrator/deadline_extractor.py`, `services/prompt_engine/registry.py`, `apps/api/routers/documents.py`, `apps/api/main.py`, `apps/web/src/components/deadlines-panel.tsx`, `apps/web/src/app/documents/[id]/page.tsx`, `apps/web/src/app/settings/prompts/page.tsx`, `apps/web/src/lib/api.ts`.

**Статус:** Завершено.

---

## 2026-07-07 — RAG (pgvector): семантический поиск по картотеке + индексация

**Запрос:** «делай дальше все этапы сразу» — подключить pgvector RAG.

**Backend:**
- Python-пакет `pgvector` + модель `DocumentChunk` (таблица уже была в `001_initial`).
- Автоиндексация новых документов после `/documents/upload`.
- `POST /documents/{id}/rag/index` — ручная переиндексация.
- `GET /documents/rag/search?q=` — семантический поиск по чанкам внутри компании.
- `POST /documents/rag/reindex-all` — поставить в очередь индексацию всех документов компании.
- Гибридный поиск: vector + keyword (fallback), в `metadata._search_mode`.
- При удалении документа чистится `document_chunks` (таблица без FK).
- Миграция: `document_chunks.embedding` → `vector(1024)` под `bge-m3`.
- `/health` → `0.7.4`, `modules.rag: true`.

**Frontend:**
- На `/documents` добавлен блок «Семантический поиск по картотеке».
- На карточке документа `/documents/[id]` — кнопка «Переиндексировать (RAG)».
- На `/documents` добавлены «Сброс» и «Переиндексировать всё», а в выдаче показывается режим (vector/keyword).

**Файлы:** `packages/db/models.py`, `packages/db/migrations/versions/008_document_chunks_embedding_1024.py`, `services/ai_orchestrator/embedder.py`, `services/rag/indexer.py`, `services/rag/chunking.py`, `apps/api/schemas_rag.py`, `apps/api/routers/documents.py`, `apps/web/src/lib/api.ts`, `apps/web/src/app/documents/page.tsx`, `apps/web/src/app/documents/[id]/page.tsx`, `apps/api/main.py`.

**Статус:** Завершено.

---

## 2026-07-07 — Phase 3: «Создание договора» (генерация + сохранение в картотеку)

**Запрос:** включить следующий модуль договорной работы — генерация договора.

**Backend:**
- `POST /contracts/generate` — генерация проекта договора в Markdown через LLM и сохранение `.docx` в картотеку.
- Преобразование markdown → docx (заголовки + буллеты + улучшенная читаемость).
- Промпт `contract_generation.system_base`.
- `/health` → `0.7.4`, `modules.contract_generation: true`.

**Frontend:**
- Включён пункт меню «Создание договора» (`/contracts/create`).
- Страница мастера: вводные → генерация → результат + ссылка на карточку документа в картотеке.

**Файлы:** `apps/api/routers/contracts.py`, `apps/api/schemas_contracts.py`, `services/document_processor/docx_from_markdown.py`, `services/document_processor/store_generated.py`, `services/prompt_engine/registry.py`, `apps/web/src/app/contracts/create/page.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/navigation.ts`.

**Статус:** Завершено.

---

## 2026-07-07 — Проверка контрагента по ИНН (MVP)

**Запрос:** добавить управление проверкой контрагента и историю.

**Backend:**
- Таблица `counterparty_checks` + миграция `007_counterparty_checks`.
- `POST /counterparty/check` (202, фон), `GET /counterparty` (история), `GET /counterparty/{id}`.
- Промпт `counterparty_check.system_base`.
- Важно: внешние реестры не дергаются автоматически — выдаётся структурированный чек-лист ручных проверок + ссылки.
- `/health` → `0.7.4`, `modules.counterparty_check: true`.

**Frontend:**
- Страница `/counterparty/check`: форма ИНН + контекст, polling статуса, история запусков + красивый отчёт (verdict/risk_score/links).
- Пункт в «Вспомогательные функции».

**Файлы:** `packages/db/models.py`, `packages/db/migrations/versions/007_counterparty_checks.py`, `apps/api/routers/counterparty.py`, `apps/api/schemas_counterparty.py`, `services/ai_orchestrator/counterparty_checker.py`, `services/prompt_engine/registry.py`, `apps/web/src/app/counterparty/check/page.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/navigation.ts`.

**Статус:** Завершено.

---

## 2026-07-07 — Создание договора: типы и динамические поля

**Запрос:** Выпадающий список типов договоров (поставка, подряд, генподряд, субподряд, трудовой), выбор «нашей позиции», смена полей формы и предзаполнение условий в пользу нашей стороны.

**Сделано:**
- Конфигурация шаблонов `contract-templates.ts`: 5 типов, позиции, дефолтные формулировки.
- UI `/contracts/create`: селекторы типа и позиции, динамические поля (в т.ч. отдельные для трудового).
- API: `our_position` + объект `fields`; промпт учитывает тип и позицию.

**Файлы:** `apps/web/src/lib/contract-templates.ts`, `apps/web/src/app/contracts/create/page.tsx`, `apps/api/schemas_contracts.py`, `apps/api/routers/contracts.py`, `apps/web/src/lib/api.ts`, `services/prompt_engine/registry.py`.

**Статус:** Завершено.

---

## 2026-07-07 — Phase 4: Консультирование и судебная работа (API 0.8.0)

**Запрос:** «Давай дальше по плану» — следующий этап после договорной работы.

**Backend:**
- Таблица `legal_work_items` + миграция `009_legal_work_items` (memo, decision_review, claim, objection).
- Сервис `legal_work_runner.py`: фоновая генерация, сохранение docx в картотеку для memo/claim/objection.
- Роутеры `consulting` и `litigation` с CRUD-историей.
- Промпты: `memo.system_base`, `decision_review.system_base`, `claim.system_base`, `objection.system_base`.
- `/health` → `0.8.0`, `modules.consulting` и `modules.litigation`: true.

**Frontend:**
- `/consulting/memo` — правовая справка.
- `/consulting/decision` — проверка приказа/распоряжения (текст или документ из картотеки).
- `/litigation/claim` — претензия / иск.
- `/litigation/objection` — отзыв / возражения.
- Все пункты Phase 4 включены в меню; группы промптов в `/settings/prompts`.

**Файлы:** `packages/db/models.py`, `packages/db/migrations/versions/009_legal_work_items.py`, `services/ai_orchestrator/legal_work_runner.py`, `apps/api/routers/consulting.py`, `apps/api/routers/litigation.py`, `apps/api/schemas_legal.py`, `apps/web/src/app/consulting/`, `apps/web/src/app/litigation/`, `apps/web/src/components/legal-work-shared.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/navigation.ts`.

**Статус:** Завершено.

**Следующий шаг:** Phase 5 — polish (экспорт, уведомления, multi-agent) или доработка UX отдельных модулей по обратной связи.

---

## 2026-07-07 — Phase 5: Multi-agent проверка, лента активности, экспорт (API 0.9.0)

**Запрос:** «Давай дальше по плану» — финальный этап прототипа (polish).

**Backend:**
- Multi-agent проверка договора: 3 параллельных агента (коммерческий, правовой, процессуальный) + `result_merger.py` (дедупликация, fusion risk score).
- Колонка `document_tasks.multi_agent` + миграция `010_review_multi_agent`.
- Промпты `contract_review.agent.*` в реестре.
- `GET /api/v1/activity` — единая лента задач по всем модулям + счётчики pending/processing.
- Экспорт DOCX для legal work (`/consulting/memos|decisions`, `/litigation/claims|objections` → `/export`).
- DELETE для записей legal work в истории.
- `/health` → `0.9.0`, `modules.activity`, `modules.multi_agent_review`: true.

**Frontend:**
- Чекбокс «Multi-agent (3 агента)» на `/contracts/review`, отображение сводки по агентам.
- `TaskNotifications` на рабочем столе — баннер активных задач.
- `RecentActivity` переведён на `/activity` — все модули в одной ленте.
- Группа промптов «Multi-agent агенты» в `/settings/prompts`.

**Файлы:** `services/ai_orchestrator/result_merger.py`, `services/ai_orchestrator/reviewer.py`, `apps/api/routers/activity.py`, `apps/api/legal_work_common.py`, `packages/db/migrations/versions/010_review_multi_agent.py`, `apps/web/src/components/task-notifications.tsx`, `apps/web/src/components/recent-activity.tsx`, `apps/web/src/app/contracts/review/page.tsx`.

**Статус:** Завершено.

**Следующий шаг:** Production hardening (Celery, OnlyOffice, Keycloak) или доработки по обратной связи пользователя.

---

## 2026-07-09 — UX промптов + роли в проверке договора (позиция)

**Запрос:** Доработать «Управление промптами»: скрывать текст по умолчанию, сделать редактирование понятным юристу и защитить схему; добавить переключение специфики/роли (подрядчик vs генподрядчик и т.п.) для проверки договора.

**Сделано:**
- UI промптов: промпт по умолчанию скрыт; раскрывается кликом по карточке.
- Для `contract_review.system_base`: “простой режим” — редактируется только человеческая часть, техническая схема ответа защищена и показана как read-only.
- Добавлены промпты ролей `contract_review.position.*` (стройка: подрядчик / генподрядчик / заказчик) и подстановка в системный промпт через `$position_instruction`.
- В `/contracts/review` добавлен выбор позиции; значение сохраняется в `document_tasks.review_position` (миграция `011_review_position`).
- В `settings/prompts` добавлена группа «Позиции в договоре».
- Расширены позиции: поставки (поставщик/покупатель) и услуги (исполнитель/заказчик).

**Файлы:** `apps/web/src/app/settings/prompts/page.tsx`, `apps/web/src/app/contracts/review/page.tsx`, `services/prompt_engine/registry.py`, `services/prompt_engine/review_prompts.py`, `services/ai_orchestrator/reviewer.py`, `apps/api/schemas_review.py`, `apps/api/routers/reviews.py`, `packages/db/models.py`, `packages/db/migrations/versions/011_review_position.py`.

**Статус:** Завершено.

---

## 2026-07-10 — Connection refused при входе

**Запрос:** Не могу зайти в приложение — `ConnectionRefusedError: [Errno 61] Connection refused` (uvloop/create_connection).

**Сделано:**
- Причина: Docker Desktop был выключен → PostgreSQL/Redis на localhost:5432/6379 недоступны.
- Запущен Docker Desktop, `docker compose up -d` — контейнеры `lexforge-postgres` и `lexforge-redis` healthy.
- Проверено: `GET /health` → 200, логин `admin@lexforge.ru` успешен, `/login` → 200.

**Статус:** Завершено.
**Следующий шаг:** Открыть http://localhost:3000/login.
