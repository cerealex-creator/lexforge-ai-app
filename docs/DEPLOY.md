# Деплой LexForge AI на Ubuntu VPS

Пошаговая инструкция для сервера **2 CPU / 4 GB RAM / Ubuntu** (например `85.239.40.180`).

## Что получится

- Сайт: `http://ВАШ_IP`
- Регистрация новых пользователей: `http://ВАШ_IP/register`
- API: `http://ВАШ_IP/api/...`
- Документация API: `http://ВАШ_IP/docs`
- Обновление кода одной командой: `bash deploy/scripts/update.sh`

## 0. Перед началом

На сервере нужен доступ по SSH (root или пользователь с sudo).

С вашего Mac:

```bash
ssh root@85.239.40.180
```

## 1. Подготовка сервера (один раз)

```bash
# Склонируйте репозиторий во временную папку или сразу в /opt
git clone https://github.com/cerealex-creator/lexforge-ai-app.git /tmp/lexforge-src
cd /tmp/lexforge-src
sudo bash deploy/scripts/setup-server.sh
```

Скрипт установит Docker, Node.js 20, Python, nginx, создаст пользователя `lexforge`, swap 2 ГБ и откроет порты 22/80/443.

## 2. Код в /opt/lexforge

```bash
sudo rsync -a --delete /tmp/lexforge-src/ /opt/lexforge/
sudo chown -R lexforge:lexforge /opt/lexforge
sudo -u lexforge -i
cd /opt/lexforge
```

Или клонируйте напрямую:

```bash
sudo -u lexforge -i
cd /opt/lexforge
git clone https://github.com/cerealex-creator/lexforge-ai-app.git .
```

## 3. Файл `.env` (секреты)

```bash
cd /opt/lexforge
cp deploy/env.production.example .env
bash deploy/scripts/generate-secrets.sh
# Скопируйте выведенные значения в .env
nano .env
```

Обязательно заполните:

| Переменная | Что поставить |
|------------|----------------|
| `PUBLIC_HOST` / `WEB_URL` / `NEXT_PUBLIC_API_URL` / `CORS_ORIGINS` | `http://85.239.40.180` (ваш IP) |
| `APP_SECRET_KEY`, `JWT_SECRET_KEY` | из `generate-secrets.sh` |
| `POSTGRES_PASSWORD` | сильный пароль; **тот же** в `DATABASE_URL` и `DATABASE_URL_SYNC` |
| `SEED_ADMIN_PASSWORD` | ваш пароль администратора |
| `ROUTERAI_API_KEY` | ключ RouterAI |

Пример фрагмента:

```env
WEB_URL=http://85.239.40.180
NEXT_PUBLIC_API_URL=http://85.239.40.180
CORS_ORIGINS=http://85.239.40.180
DATABASE_URL=postgresql+asyncpg://lexforge:ВАШ_ПАРОЛЬ_БД@127.0.0.1:5432/lexforge
DATABASE_URL_SYNC=postgresql://lexforge:ВАШ_ПАРОЛЬ_БД@127.0.0.1:5432/lexforge
```

## 4. Первый запуск

```bash
cd /opt/lexforge
bash deploy/scripts/first-deploy.sh
```

Скрипт:

1. поднимет PostgreSQL + Redis в Docker;
2. установит Python/Node зависимости;
3. применит миграции и создаст seed-админа;
4. соберёт Next.js;
5. включит systemd-сервисы и nginx.

Откройте в браузере: **http://85.239.40.180**

## 5. Пользователи

### Вы (админ из seed)

- Email: значение `SEED_ADMIN_EMAIL` (по умолчанию `admin@lexforge.ru`)
- Пароль: `SEED_ADMIN_PASSWORD` из `.env`

### Другой пользователь

1. Откройте **http://ВАШ_IP/register**
2. Укажите ФИО, email, название компании, пароль
3. После регистрации откроется рабочий стол с новой компанией

На странице входа есть ссылка «Зарегистрироваться».

## 6. Как вносить доработки, когда приложение уже на сервере

Рекомендуемый цикл:

### На Mac (разработка)

```bash
# правки кода...
git add -A
git commit -m "Описание изменения"
git push origin main
```

### На сервере (обновление)

```bash
ssh root@85.239.40.180
sudo -u lexforge -i
cd /opt/lexforge
git pull
bash deploy/scripts/update.sh
```

`update.sh` сам:

- подтянет зависимости;
- накатит миграции БД;
- пересоберёт frontend;
- перезапустит API и Web.

### Если правите прямо на сервере (быстрый hotfix)

```bash
sudo -u lexforge -i
cd /opt/lexforge
nano путь/к/файлу.py   # или .tsx
bash deploy/scripts/update.sh
```

Потом лучше перенесите правку в git на Mac и сделайте `git push`, чтобы не потерять.

### Полезные команды на сервере

```bash
# Статус
sudo systemctl status lexforge-api lexforge-web
docker ps

# Логи
sudo journalctl -u lexforge-api -f
sudo journalctl -u lexforge-web -f
docker compose -f /opt/lexforge/deploy/docker-compose.prod.yml logs -f

# Перезапуск без полной пересборки
sudo systemctl restart lexforge-api
sudo systemctl restart lexforge-web
```

## 7. HTTPS (когда появится домен)

1. Купите/привяжите домен к `85.239.40.180`
2. В `.env` замените `http://IP` на `https://ваш.домен`
3. Установите сертификат:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш.домен
```

4. Пересоберите frontend (`update.sh`), чтобы `NEXT_PUBLIC_API_URL` стал `https://...`

## 8. Что где лежит

```
/opt/lexforge/                 код приложения
/opt/lexforge/.env             секреты (не коммитить)
/opt/lexforge/uploads/         загруженные договоры
/opt/lexforge/deploy/          скрипты и конфиги деплоя
/etc/systemd/system/lexforge-* systemd-сервисы
/etc/nginx/sites-available/lexforge
```

## 9. Типичные проблемы

| Симптом | Что проверить |
|---------|----------------|
| Сайт не открывается | `sudo systemctl status nginx lexforge-web`, `ufw status` |
| «API не отвечает» | `curl http://127.0.0.1:8000/health`, логи `lexforge-api` |
| Ошибка CORS | `WEB_URL` и `CORS_ORIGINS` совпадают с адресом в браузере |
| Frontend ходит на localhost | Пересобрать web после смены `NEXT_PUBLIC_API_URL` (`update.sh`) |
| `next build` падает по памяти | Убедиться, что swap включён: `swapon --show` |
| Нет компании у нового пользователя | Используйте `/register` (создаёт компанию автоматически) |

## 10. Безопасность (минимум)

- Не оставляйте `CHANGE_ME` в `.env`
- Не открывайте наружу порты 5432/6379/8000/3000 (в prod-compose они только на `127.0.0.1`)
- Смените пароль seed-админа
- Когда будет домен — включите HTTPS
