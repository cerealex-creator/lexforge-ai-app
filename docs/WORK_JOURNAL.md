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

---

## 2026-07-10 — Push + экспорт договора с комментариями Word

**Запрос:** Запушить текущую версию; затем сделать скачивание .docx с комментариями в режиме рецензирования по findings ИИ.

**Сделано:**
- Запушено в `origin/main`: commit `9c89984` (позиции проверки + addendum-модель промптов).
- Новый экспортёр `annotate_docx_with_comments`: копия исходного .docx, поиск цитат, Word comments + жёлтая подсветка; unmatched — в приложение в конце файла.
- API: `GET /api/v1/reviews/{task_id}/export-annotated` (только для исходников .docx).
- UI: кнопка «Договор с комментариями (.docx)» на странице проверки и в `ReviewResultPanel`.

**Файлы:** `services/document_processor/annotated_export.py`, `apps/api/routers/reviews.py`, `apps/web/src/lib/api.ts`, `apps/web/src/components/review-result-panel.tsx`, `apps/web/src/app/contracts/review/page.tsx`, `apps/web/src/app/contracts/review/[taskId]/page.tsx`.

**Статус:** Завершено (нужен перезапуск API).
**Следующий шаг:** Проверить на реальной проверке .docx в Word (панель «Рецензирование» → «Показать примечания»).

---

## 2026-07-10 — Автор комментариев + перепроверка договора

**Запрос:** Автор Word-комментариев от имени юриста компании (с полем ввода); перепроверка с одобрением замечаний и фокусом по указаниям юриста без ломания уже принятого.

**Сделано:**
- Экспорт annotated .docx: параметр `comment_author` (default `Юрист {company.name}`), поле в UI перед скачиванием; initials из имени автора.
- Миграция `012_review_context`: JSONB `document_tasks.review_context`.
- Create review: `parent_task_id`, `refine_scope` (`focus_only`|`supplement`), `accepted_findings`, `lawyer_notes` — новая задача, настройки наследуются от parent.
- Промпт + merge: одобренные findings сохраняются, LLM возвращает только новые; дедуп и пересчёт risk_score; метаданные `refined_from` / `accepted_count` / `new_count`.
- UI: чекбоксы «Одобрено», панель «Доработать проверку», бейдж перепроверки.

**Файлы/артефакты:**
- `services/document_processor/annotated_export.py`
- `apps/api/routers/reviews.py`, `apps/api/schemas_review.py`
- `packages/db/models.py`, `packages/db/migrations/versions/012_review_context.py`
- `services/prompt_engine/review_prompts.py`, `services/ai_orchestrator/reviewer.py`
- `apps/web/src/components/review-result-panel.tsx`, review pages, `apps/web/src/lib/api.ts`

**Статус:** Завершено.

---

## 2026-07-10 — Убран preview договора + замечания к каждому finding

**Запрос:** Зачем фрагмент договора на результате (рандом?); убрать если бесполезен. Добавить поле замечания юриста в каждый блок finding для перепроверки.

**Сделано:**
- Убран блок «Текст договора (фрагмент)» с экрана результата проверки (это были первые ~1500 символов `parsed_text`, не привязанные к findings — практической пользы нет).
- У каждого finding: textarea «Замечание юриста к этому пункту»; при вводе снимается «Одобрено», блок подсвечивается; панель «Доработать проверку» открывается автоматически.
- В API добавлен `finding_feedback: [{ finding, note }]` — сохраняется в `review_context`, попадает в промпт перепроверки; ИИ обязан пересмотреть/исправить конкретные пункты по комментарию юриста (вместе с общими указаниями внизу).
- Режим `focus_only` допускает запуск при наличии только per-finding замечаний (без общего текста).

**Файлы/артефакты:**
- `apps/web/src/components/review-result-panel.tsx`
- `apps/web/src/app/contracts/review/page.tsx`
- `apps/web/src/app/contracts/review/[taskId]/page.tsx`
- `apps/web/src/lib/api.ts`
- `apps/api/schemas_review.py` (`FindingFeedbackIn`)
- `apps/api/routers/reviews.py`
- `services/prompt_engine/review_prompts.py`
- `services/ai_orchestrator/reviewer.py`

**Статус:** Завершено.
**Следующий шаг:** Проверить перепроверку с замечаниями к отдельным блокам на реальном договоре.

---

## 2026-07-10 — Фаза 1: Проекты (Matter) + судебный профиль

**Запрос:** Заложить проектный подход; stage/specificity; судебный профиль (КАД/упоминания) в проекте и вне; начать реализацию фазы 1.

**Сделано:**
- Миграция `013_projects`: таблицы `projects`, `project_documents`; nullable `project_id` на reviews/comparisons/legal_work/counterparty_checks.
- Поля проекта: kind, stage, specificity, brief, counterparty, **judicial_profile** (JSONB: summary, kad_notes, media_notes, risk_flags, sources).
- API `/api/v1/projects` (CRUD, from-document, attach/upload docs, judicial-profile).
- Контекст проекта (`format_project_context`) подмешивается в review / comparison / counterparty.
- Проверка контрагента с `project_id` обновляет `judicial_profile` (чеклист КАД; live-поиск дел — позже).
- UI: `/projects`, `/projects/new`, `/projects/[id]`; «Создать проект» на карточке документа; CTA проверка/сравнение с `project_id` в query.

**Файлы:** `013_projects.py`, `models.py`, `schemas_project.py`, `routers/projects.py`, `project_context.py`, `reviewer.py`, `comparator.py`, `counterparty_checker.py`, `apps/web/src/app/projects/**`, `api.ts`, `navigation.ts`.

**Статус:** Завершено (фаза 1).
**Следующий шаг:** Фаза 2 — memory_json (уступки), live КАД/реестры, «оценка redline в контексте проекта».

---

## 2026-07-10 — Фаза 2: память проекта + redline-in-context

**Запрос:** Продолжить — фаза 2: memory_json (открытые риски, одобренные позиции, уступки), подмешивание в промпты, оценка redline в контексте проекта, UI.

**Сделано:**
- `project_memory.py`: `update_memory_from_review` / `update_memory_from_comparison`, `format_memory_block` (open_risks, accepted_positions, concessions, closed_issues, notes).
- `format_project_context(..., for_redline=)` добавляет блок памяти и инструкции режима redline.
- После успешной проверки/сравнения с `project_id` обновляется `project.memory_json`.
- Comparison: `for_redline=True`, если у проекта есть memory/brief/stage/specificity.
- UI `/projects/[id]`: блок «Память проекта»; CTA «Оценить redline контрагента».

**Файлы/артефакты:**
- `services/prompt_engine/project_memory.py`
- `services/prompt_engine/project_context.py`
- `services/ai_orchestrator/reviewer.py`, `comparator.py`
- `apps/web/src/app/projects/[id]/page.tsx`

**Статус:** Завершено (фаза 2 memory/redline; live КАД — отдельно).
**Следующий шаг:** Live КАД/реестры; ручное редактирование/очистка памяти; проверить на реальном цикле review → refine → compare.

---

## 2026-07-10 — UX: рабочий стол Проект / Разовая задача

**Запрос:** Перестроить рабочий стол и сайдбар: в блоках только «Проект» и «Разовая задача»; инструменты внутри проекта/экрана задачи; «i»-подсказки; настройки и недавние — в сайдбар; список проектов в работе.

**Сделано:**
- Дашборд: три фактурных блока с крупными заголовками и кнопками Проект / Разовая задача (+ InfoTip).
- Экраны `/work/[section]/project` (выбор/создание проекта) и `/work/[section]/task` (выбор инструмента с «i»).
- Сайдбар: панели разделов (Проект/Задача), «Проекты в работе», свёрнутые «Недавние задачи», «Настройки и сервисы»; убраны плоские списки инструментов.
- Карточка проекта: блок «Инструменты» с ToolPanel + InfoTip; контекст по желанию.
- `projects/new?kind=` из раздела; InfoTip / ToolPanel компоненты.

**Файлы:** `navigation.ts`, `app-shell.tsx`, `dashboard/page.tsx`, `work/[section]/**`, `info-tip.tsx`, `tool-panel.tsx`, `sidebar-*.tsx`, `projects/[id]/page.tsx`, `projects/new/page.tsx`.

**Статус:** Завершено (прототип для оценки).
**Следующий шаг:** Протестировать UX; при необходимости — «создать проект из результата» на экранах review/compare; мини-опрос контекста.

---

## 2026-07-11 — Due diligence guide + проект из результата + опрос + память

**Запрос:** По ближнему контуру: без live КАД — усилить самостоятельный чеклист (ресурсы/техники); «создать проект из результата»; мини-опрос контекста как опция при полях с примерами; ручное редактирование/очистка памяти.

**Сделано:**
- Справочник ресурсов DD (`due_diligence_guide.py` / `due-diligence-guide.ts`): ЕГРЮЛ, КАД, ФССП, Федресурс, закупки, Фокус/СПАРК, СМИ, санкции — что смотреть и как.
- Промпт и runner контрагента: `how_to_check`, `url`, `search_technique`; UI чеклиста с техниками; гайд на `/counterparty/check` и карточке проекта.
- Кнопка «Создать проект» / «Открыть проект» на результатах review и compare (`CreateProjectFromResultButton`); `project_id` в API out.
- `ProjectContextFields`: поля с вопросом+примером; переключатель «Мини-опрос».
- PATCH `memory_json`; UI: просмотр, правка JSON, очистка.

**Файлы:** `due_diligence_guide.*`, `counterparty_checker.py`, `registry.py`, `schemas_project.py`, `schemas_review/comparison`, review/compare pages, `projects/new`, `projects/[id]`, `project-context-fields.tsx`, `create-project-from-result.tsx`.

**Статус:** Завершено.
**Следующий шаг:** Проверка на реальном цикле (review → refine → compare → memory); UX-фидбек по столу.

---

## 2026-07-11 — Документ architecture_lexforge.md

**Запрос:** Сделать `architecture_lexforge.md` по аналогии с `hr_ai_agent/ARCHITECTURE.md`.

**Сделано:** Описание стека, структуры monorepo, модели данных, потока проверки договора (mermaid), запуска локально, enterprise-задела.

**Файлы/артефакты:** `architecture_lexforge.md`

**Статус:** Завершено.

---

## 2026-07-13 — Позиции генподрядчика: две подкатегории

**Запрос:** Разделить промпт генподрядчика: договор с подрядчиком vs с заказчиком; дан базовый текст для ГП→Подрядчик.

**Сделано:**
- UI: `gc_vs_contractor` («генподрядчик → подрядчик»), `gc_vs_customer` («генподрядчик ← заказчик») вместо одной кнопки.
- Промпты в `registry.py`: текст пользователя для ГП→Подрядчик; зеркальный/обновлённый для ГП←Заказчик.
- Legacy `general_contractor` мапится на ГП→Подрядчик без отдельной карточки в UI.

**Файлы:** `services/prompt_engine/registry.py`, `apps/web/src/app/contracts/review/page.tsx`, `reviewer.py`

**Статус:** Завершено.

---

## 2026-07-13 — Каскадный анализ (ГП → Подрядчик)

**Запрос:** Подрежим «Каскадный анализ»: сравнить договор с подрядчиком и (если загружен) с заказчиком, выявить разрывы.

**Сделано:**
- API: `cascade_analysis` + `upstream_document_id`; хранение в `review_context`; валидация позиции `gc_vs_contractor`.
- Промпт: блок каскада + поля finding `cascade_gap` / upstream_clause / downstream_clause / gap_summary.
- UI: чекбокс при позиции ГП→Подрядчик + выбор договора с заказчиком из картотеки; бейдж и карточки разрывов в результате.

**Файлы:** `schemas_review.py`, `routers/reviews.py`, `review_prompts.py`, `reviewer.py`, review page, `review-result-panel.tsx`, `api.ts`.

**Статус:** Завершено.


## 2026-07-13 — Промпты только в коде (без UI-редактирования)

**Запрос:** Один базовый промпт на позицию в коде; убрать редактирование промптов в приложении; оставить замечания только для перегенерации результатов.

**Сделано:**
- UI: пункт «Управление промптами» убран из настроек; `/settings/prompts` — страница-заглушка с объяснением.
- API: PUT/reset промптов отдают 410; GET — read-only из registry.
- Runtime: `get_prompt_map` читает только `registry.py`, `prompt_overrides` не используются.
- Документация: `architecture_lexforge.md` обновлена под новую модель.

**Файлы/артефакты:** `prompt_service.py`, `apps/api/routers/prompts.py`, `apps/web/src/app/settings/prompts/page.tsx`, `navigation.ts`, `api.ts`, `registry.py` (docstring), `architecture_lexforge.md`.

**Статус:** Завершено.

**Следующий шаг:** Пользователь присылает пакет базовых промптов (лучше одним структурированным документом) — внести в `registry.py`.

## 2026-07-13 — Шаблон prompts_pack + промпт Подрядчика

**Запрос:** Создать файл для вставки промптов; вставить первый промпт (позиция Подрядчик) как пример.

**Сделано:**
- `docs/prompts_pack.md` — секции по KEY с маркерами `<<<PROMPT` / `PROMPT>>>`.
- Промпт Подрядчика внесён в pack и в `registry.py` (`construction.contractor`).

**Файлы/артефакты:** `docs/prompts_pack.md`, `services/prompt_engine/registry.py`

**Статус:** Завершено.

**Следующий шаг:** Пользователь заполняет остальные секции в `prompts_pack.md`.

## 2026-07-13 — Общий system_base промпт (судья)

**Запрос:** Создать общий промпт на основе текста «арбитражный судья» и вставить в prompts_pack (остальные позиции пользователь уже заполнил).

**Сделано:**
- Собран `contract_review.system_base`: роль/принципы из текста пользователя + placeholders `$industry_label/$company_name/$position_instruction/$mode_instruction` + JSON-схема приложения.
- Severity/risk_score сопоставлены с КРИТИЧНО/ЖЕЛАТЕЛЬНО/ОПЦИОНАЛЬНО и шкалой 1–10.
- Внесено в `docs/prompts_pack.md` и `registry.py`.

**Файлы/артефакты:** `docs/prompts_pack.md`, `services/prompt_engine/registry.py`

**Статус:** Завершено.

**Следующий шаг:** По запросу — внести все заполненные позиционные промпты из pack в registry.

## 2026-07-13 — Единая шкала риска 1–10

**Запрос:** Привести оценку к одной системе: чем ниже балл, тем меньше риска (абзац «1–3 фатально / 9–10 защищён» выбивался).

**Сделано:**
- `system_base`: инвертированная шкала «защищённости» заменена на шкалу риска (1–3 низкий … 9–10 критический).
- Все 8 позиционных блоков в `prompts_pack.md` — единый финальный абзац про шкалу + порог ≥7.
- В `registry.py` обновлены `SYSTEM_BASE_DEFAULT` и концовка `_CONTRACTOR`.
- UI уже трактовал высокий балл как опасный (красный) — без изменений.

**Файлы/артефакты:** `docs/prompts_pack.md`, `services/prompt_engine/registry.py`

**Статус:** Завершено.

## 2026-07-13 — Базовые промпты из prompts_pack в registry

**Запрос:** Реализовать все промпты из pack как базовые в коде.

**Сделано:**
- Все 8 позиционных промптов + `contract_review.system_base` синхронизированы из `docs/prompts_pack.md` в `services/prompt_engine/registry.py`.
- Содержимое совпадает 1:1 (проверено скриптом).
- Статусы в pack → «готово».

**Файлы/артефакты:** `services/prompt_engine/registry.py`, `docs/prompts_pack.md`

**Статус:** Завершено.

## 2026-07-14 — Fix: «Недействительный токен» при проверке

**Запрос:** При запуске проверки выдаётся «Недействительный токен».

**Причина:** Устаревший JWT в localStorage (истёк / сменился JWT_SECRET в .env); UI показывал форму по наличию token, не проверяя сессию.

**Сделано:**
- AuthGuard: проверка `/auth/me`, обновление токена, редирект на login при 401.
- api.ts: при 401 на авторизованных запросах — logout + понятное сообщение.
- login: баннер «Сессия истекла» при `?expired=1`.
- API: отдельное сообщение для истёкшего токена.

**Файлы:** `auth-guard.tsx`, `api.ts`, `store.ts`, `login/page.tsx`, `dependencies.py`

**Статус:** Завершено.

**Для пользователя:** Запустить Docker + `make up`, выйти и войти заново (admin@lexforge.ru / admin123).

## 2026-07-14 — Login: понятная ошибка при остановленной БД

**Запрос:** Не могу войти в приложение — «Ошибка входа».

**Причина:** Docker/PostgreSQL не запущены; login падал с HTTP 500 без JSON.

**Сделано:**
- `/health` показывает `database: false` при недоступной БД.
- Login возвращает 503 с текстом про Docker + `make up`.
- Страница login: предупреждение при старте + понятные сообщения об ошибках.

**Файлы:** `main.py`, `database.py`, `routers/auth.py`, `api.ts`, `login/page.tsx`

**Статус:** Завершено.

## 2026-07-14 — Комментарии Word: чистый вид по умолчанию

**Запрос:** Комментарии в режиме рецензирования — от имени юриста без [Высокая], Тип: risks и AI-пометки; чекбоксы для включения.

**Сделано:**
- По умолчанию: только rationale + правка; автор в метаданных Word.
- Опции `include_metadata`, `include_ai_disclaimer` (API + UI чекбоксы).
- Приложение unmatched без «Цитата ИИ» и без [severity] по умолчанию.

**Файлы:** `annotated_export.py`, `routers/reviews.py`, `review-result-panel.tsx`, `api.ts`, review pages.

**Статус:** Завершено.

## 2026-07-14 — Комментарии Word: только предложения правок

**Запрос:** В режиме рецензирования показывать контрагенту только «Предлагаю изложить так: п. X «…»» без внутренних рассуждений о рисках.

**Сделано:**
- `_comment_body`: только предложение редакции; rationale не выводится.
- Findings без `suggested_revision` не попадают в комментарии.
- Приложение unmatched — тоже только предложения.
- UI-подсказка обновлена.

**Файлы:** `annotated_export.py`, `review-result-panel.tsx`

**Статус:** Завершено.

## 2026-07-14 — Fix: Heading 1 при экспорте annotated

**Запрос:** Ошибка при скачивании договора с комментариями: no style with name Heading 1.

**Сделано:** Вместо `add_heading` — обычный жирный абзац (`_add_plain_heading`), не зависящий от стилей шаблона договора.

**Файлы:** `services/document_processor/annotated_export.py`

**Статус:** Завершено.

## 2026-07-14 — Копилка одобренных + focused refine

**Запрос:** После перепроверки ИИ смешивает всё; нужны копилка одобренных, доработка только по замечаниям, дифф и экспорт только одобренных.

**Сделано:**
- Stable `id` у findings; `approved_vault` в result_json.
- Режим `focus_only`: узкий LLM-промпт только по feedback; merge → vault / revised / deferred / new.
- UI: блок «Копилка», секции исправлено/новые/отложено, дифф «было→стало», кнопка «В копилку».
- `POST /reviews/{id}/approve` без LLM; export-annotated `only_approved=true` по умолчанию.

**Файлы:** `review_findings.py`, `reviewer.py`, `review_prompts.py`, `schemas_review.py`, `routers/reviews.py`, `review-result-panel.tsx`, `api.ts`, review pages.

**Статус:** Завершено.

## 2026-07-14 — Отмена замечаний (dismiss blacklist)

**Запрос:** Чек-бокс «отменить замечание» после генерации; ИИ больше не поднимает этот пункт при доработке.

**Сделано:**
- `dismissed_findings` в result_json (blacklist): merge / extract / filter в `review_findings.py`.
- Промпт refine/supplement: блок «отменённые — не поднимай снова»; focus_only тоже получает список.
- `POST /api/v1/reviews/{id}/dismiss` — сразу убирает из working set без LLM.
- UI: чекбокс «Отменить замечание», свёрнутый список отменённых; при refine список наследуется.
- Наследование `dismissed_findings` в `review_context` при создании перепроверки.

**Файлы:** `review_findings.py`, `reviewer.py`, `review_prompts.py`, `schemas_review.py`, `routers/reviews.py`, `review-result-panel.tsx`, `api.ts`, review pages.

**Статус:** Завершено.
**Следующий шаг:** Перезапуск API (`make api-stop && make api`) и проверка в UI.

## 2026-07-14 — Протокол разногласий (табличный .docx)

**Запрос:** Добавить создание протокола разногласий в табличной форме: редакция одной стороны, редакция другой, комментарии каждой стороны.

**Сделано:**
- `build_disagreement_protocol()` в `exporter.py` — landscape Word: № / Пункт / Редакция (контрагент) / Редакция (наша) / Комментарий (контрагент, пусто) / Комментарий (наш); блок подписей.
- `GET /api/v1/reviews/{id}/export-protocol` — по умолчанию из копилки одобренных; опции `include_our_comments`, подписи сторон.
- UI: превью таблицы + кнопка «Протокол разногласий (.docx)» рядом с остальными экспортами.

**Файлы:** `services/document_processor/exporter.py`, `apps/api/routers/reviews.py`, `apps/web/src/lib/api.ts`, `review-result-panel.tsx`, review pages.

**Статус:** Завершено.
**Следующий шаг:** Перезапуск API и проверка скачивания после одобрения пунктов в копилку.

## 2026-07-14 — Дополнить vs изложить в новой редакции

**Запрос:** Комментарии «Предлагаю изложить так» путают: при дополнении кажется, что весь пункт заменяется. Нужно явно различать дополнение и полную новую редакцию, в т.ч. в Word.

**Сделано:**
- Поле `revision_action`: `restate` | `supplement` в схеме ответа ИИ (`registry.py`, `prompts_pack.md`, focused refine).
- Комментарии Word: «Предлагаю дополнить … следующим текстом» / «Предлагаю изложить … в следующей редакции».
- Нормализация и эвристика для старых findings без поля (`normalize_revision_action`).
- UI: бейджи и подписи «Дополнить» / «Изложить в новой редакции»; то же в заключении и протоколе.

**Файлы:** `review_findings.py`, `annotated_export.py`, `exporter.py`, `registry.py`, `prompts_pack.md`, `review_prompts.py`, `schemas_review.py`, `api.ts`, `review-result-panel.tsx`, `result_merger.py`.

**Статус:** Завершено.
**Следующий шаг:** Перезапуск API; для явного поля от модели — новая проверка; старые результаты частично распознаются эвристикой.

## 2026-07-14 — Позиции: Покупатель, Поставщик, поставщик услуг

**Запрос:** Можно проверить только как Подрядчик/Генподрядчик/Заказчик; нужны также Покупатель, Поставщик и поставщик услуг.

**Сделано:**
- На странице проверки все позиции показаны группами (строительство / поставка / производство / услуги), без привязки только к отрасли в шапке.
- Выбор позиции задаёт industry + review_position; синхронизируется с отраслью в шапке.
- «Исполнитель» переименован в «поставщик услуг»; production.buyer/supplier используют промпты supply.

**Файлы:** `apps/web/src/app/contracts/review/page.tsx`, `services/ai_orchestrator/reviewer.py`, `registry.py`, `exporter.py`.

**Статус:** Завершено.

## 2026-07-14 — Новая редакция после проверки + создание на основе существующего

**Запрос:** Генерировать и скачивать договор в новой редакции по итогам проверки; в «Создание договора» — создание на основе существующего с изменениями.

**Сделано:**
- `apply_revisions_to_docx`: restate/supplement в тело .docx; unmatched — в приложение.
- `GET /reviews/{id}/export-revised` (+ опция сохранить в картотеку); кнопка «Новая редакция (.docx)» в UI проверки.
- `POST /contracts/revise` + промпт `contract_revise.system_base`.
- `/contracts/create`: режимы «С нуля» / «На основе существующего» (DocumentPicker + список изменений).

**Файлы:** `apply_revisions.py`, `routers/reviews.py`, `routers/contracts.py`, `schemas_contracts.py`, `registry.py`, `review-result-panel.tsx`, `api.ts`, review pages, `contracts/create/page.tsx`, `navigation.ts`.

**Статус:** Завершено.
**Следующий шаг:** Перезапуск API; для новой редакции исходник должен быть .docx, правки — в копилке.

## 2026-07-14 — Создание договора: сфера Услуги

**Запрос:** В создание договора добавить сферу «Услуги» и роли Поставщик и Заказчик.

**Сделано:**
- Тип `services` — «Договор оказания услуг» с позициями «Мы — поставщик (исполнитель)» и «Мы — заказчик».
- Дефолтные поля под услуги (предмет, сроки, приёмка, оплата, ответственность).
- В промпте генерации учтены договоры услуг (гл. 39 ГК РФ).

**Файлы:** `apps/web/src/lib/contract-templates.ts`, `services/prompt_engine/registry.py`.

**Статус:** Завершено.

## 2026-07-14 — Коммит и пуш: review/create UX batch

**Запрос:** Коммит и пуш, запись в журнал.

**Сделано:**
- Зафиксирован и отправлен на `origin/main` накопленный пакет: копилка/отмена замечаний, revise/focus, протокол разногласий, revision_action (дополнить/изложить), новая редакция .docx, создание на основе существующего, позиции supply/services, промпты в registry/prompts_pack, journal.

**Файлы/артефакты:** коммит на ветке `main`, push `origin/main`.

**Статус:** Завершено.

## 2026-07-14 — Карта договора и углублённая проверка раздела
**Запрос:** После проверки показывать структуру договора, покрытие требований, отсутствующие нормы и оценку безопасности; дать возможность попросить ИИ внимательнее проверить конкретный важный раздел с дополнительным комментарием юриста.
**Сделано:**
- После первичной проверки выполняется отдельный аудит покрытия: резюме договора, структура, карта требований со статусами, отсутствующие положения, неопределённости и итоговая статистика.
- Добавлен обязательный юридический чек-лист применимости и явное раскрытие ограничения, если текст превышает доступный промпту объём.
- В карточке каждого раздела добавлена команда «Проверить внимательнее» и необязательный комментарий юриста.
- Углублённая проверка создаётся как дочерняя задача, анализирует выбранный раздел и связанные положения по всему договору, сохраняет историю выводов и добавляет только найденные конкретные замечания.
- Карта покрытия и история углублённых проверок наследуются при последующих refine/re-review; отменённые замечания не возвращаются.
- Backend принимает от клиента только ID раздела и сверяет его с канонической картой родительской проверки; прямой URL дочерней задачи теперь опрашивает статус до завершения.
- Для длинных договоров targeted recheck собирает контекст вокруг ссылок/заголовка выбранного раздела, а риск и карточка раздела обновляются по результату углублённой проверки.
**Файлы/артефакты:** `services/prompt_engine/review_prompts.py`, `services/ai_orchestrator/reviewer.py`, `apps/api/schemas_review.py`, `apps/api/routers/reviews.py`, `apps/web/src/lib/api.ts`, `apps/web/src/components/review-result-panel.tsx`, `apps/web/src/app/contracts/review/page.tsx`, `apps/web/src/app/contracts/review/[taskId]/page.tsx`.
**Статус:** Завершено. Python-модули компилируются; frontend typecheck доходит до 5 ранее существовавших ошибок `FormField` в `apps/web/src/app/contracts/create/page.tsx`.
**Следующий шаг:** Перезапустить API и web, выполнить новую проверку договора и проверить сценарий углублённой проверки раздела на реальном LLM-ответе.

## 2026-07-17 — Режим «Проверка на ошибки» только технический; убран «Угрозы и риски»
**Запрос:** Режим ошибок должен проверять только орфографию/синтаксис/хвосты шаблона; убрать режим «Угрозы и риски»; при ошибках отключать выбор позиции.
**Сделано:**
- Отдельный промпт технической проверки без юридического каркаса и без позиционных playbook.
- В режиме `errors` не запускаются multi-agent, карта покрытия и позиционные инструкции; findings фильтруются до `issue_type=errors`.
- В UI остались только «Полная проверка» и «Проверка на ошибки»; блок позиций, каскад, multi-agent и эталон скрыты в режиме ошибок.
**Файлы:** `services/prompt_engine/review_prompts.py`, `services/prompt_engine/registry.py`, `services/ai_orchestrator/reviewer.py`, `apps/web/src/app/contracts/review/page.tsx`, `services/document_processor/exporter.py`.
**Статус:** Завершено.
**Следующий шаг:** Перезапустить API/web и прогнать договор ООО ПУЛЬС ГРУПП в режиме ошибок.

## 2026-07-17 — Полная проверка без технической корректуры
**Запрос:** Полная проверка не должна так подробно фокусироваться на ошибках, как режим проверки на ошибки.
**Сделано:**
- В `MODE_DEFAULTS.full` явно задан юридический фокус и запрет на орфографию/синтаксис/хвосты шаблона.
- В `SYSTEM_BASE` уточнён `issue_type=errors` (логические/структурные дефекты) и добавлено правило не делать корректуру.
- У процессуального multi-agent агента убран акцент на «ошибках оформления» в смысле корректуры.
**Файлы:** `services/prompt_engine/registry.py`, `docs/prompts_pack.md`.
**Статус:** Завершено.

## 2026-07-17 — Нумерация пунктов в скачанной исправленной редакции
**Запрос:** В скачанной исправленной версии договора исправленные пункты теряли нумерацию (например, вместо 1.2. оставался голый абзац).
**Сделано:**
- При `restate` экспорт новой редакции сохраняет номер пункта из исходного абзаца или из `clause_ref`, если его нет в `suggested_revision`.
- Автонумерация Word (`numPr`) не дублируется.
- В промпте технической проверки для `restate` ИИ обязан начинать правку с номера пункта.
**Файлы:** `services/document_processor/apply_revisions.py`, `services/prompt_engine/review_prompts.py`.
**Статус:** Завершено.

## 2026-07-17 — Полная проверка без технической корректуры
**Запрос:** Полная проверка не должна так подробно фокусироваться на ошибках, как режим проверки на ошибки.
**Сделано:**
- В `MODE_DEFAULTS.full` явно задан юридический фокус и запрет на орфографию/синтаксис/хвосты шаблона.
- В `SYSTEM_BASE` уточнён `issue_type=errors` (логические/структурные дефекты) и добавлено правило не делать корректуру.
- У процессуального multi-agent агента убран акцент на «ошибках оформления» в смысле корректуры.
**Файлы:** `services/prompt_engine/registry.py`, `docs/prompts_pack.md`.
**Статус:** Завершено.

## 2026-07-17 — Подготовка к деплою на VPS
**Запрос:** Подготовить всё для деплоя: регистрация пользователей (хотя бы одного кроме админа) и понятный способ вносить доработки на сервере.
**Сделано:**
- Регистрация: `POST /auth/register` создаёт пользователя + компанию (роль admin); страница `/register`; ссылка со входа.
- CORS через `CORS_ORIGINS` / `WEB_URL`.
- Прод-артефакты: `deploy/docker-compose.prod.yml`, nginx, systemd, скрипты `setup-server` / `first-deploy` / `update` / `generate-secrets`.
- Инструкция `docs/DEPLOY.md`: первый запуск и цикл обновлений `git pull` + `update.sh`.
**Файлы/артефакты:** `deploy/`, `docs/DEPLOY.md`, `apps/web/src/app/register/`, `apps/api/routers/auth.py`, `apps/api/config.py`.
**Статус:** Завершено (локально; на VPS ещё не развёрнуто).
**Следующий шаг:** Закоммитить и запушить, затем на `85.239.40.180` пройти шаги из `docs/DEPLOY.md`.
