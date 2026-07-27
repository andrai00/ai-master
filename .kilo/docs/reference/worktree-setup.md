# Kilo Agent Manager — Worktree Setup

## Что такое ворктри

Ворктри (worktree) — изолированная копия репозитория, создаваемая Kilo Agent Manager для параллельной работы нескольких AI-агентов. Каждый ворктри живёт в `.kilo/worktrees/<имя-ветки>/` и имеет свою копию БД, свой `node_modules` и уникальный порт dev-сервера.

## Структура ворктри

```
.kilo/worktrees/<branch-name>/
├── .env                  # копируется из основного репо (DATABASE_URL=file:./data/ai-master.db)
├── node_modules/         # устанавливается через pnpm (глобальный store → мгновенно)
├── data/
│   └── ai-master.db      # копия БД из основного репо (своя для каждого ворктри)
├── src/                  # исходники (git worktree)
├── prisma/               # схема и миграции (git worktree)
└── ...
```

## Скрипты Kilo

### `setup-script.ps1` — запускается ОДИН раз при создании ворктри

Выполняет:
1. `pnpm install` — устанавливает зависимости (быстро, т.к. pnpm использует глобальный content-addressable store)
2. Копирует `data/ai-master.db` из основного репо — каждый ворктри получает СВОЮ копию БД
3. `pnpm prisma generate` — генерирует Prisma-клиент

Env-переменные доступные в скрипте:
- `WORKTREE_PATH` — абсолютный путь к ворктри (например, `C:\...\.kilo\worktrees\eastern-watch`)
- `REPO_PATH` — абсолютный путь к основному репо

### `run-script.ps1` — запускается по кнопке Run в Agent Manager

1. **Self-heal**: если нет `node_modules` → `pnpm install`
2. **Self-heal**: если нет `data/ai-master.db` → копирует из основного репо
3. **Self-heal**: если нет `.prisma` → `pnpm prisma generate`
4. **Уникальный порт**: вычисляется детерминированно из имени ворктри-директории (диапазон 3001–3099)
5. Запускает `pnpm next dev -p <port>`

## Порты ворктри

Порт вычисляется как хеш от имени директории ворктри. Два ворктри с разными именами **гарантированно** получат разные порты. Один и тот же ворктри всегда получает один и тот же порт (детерминированно).

| Ворктри | Порт |
|---------|------|
| `eastern-watch` | 3061 |
| `working-fisherman` | 3087 |
| `dev` | 3002 |

Формула: `port = 3001 + (djb2_hash(branch_name) % 99)`

## Изоляция БД

Каждый ворктри работает со **своей** копией `data/ai-master.db`. Это предотвращает:
- Конфликты при параллельном изменении схемы
- Затирание данных между ворктри
- Блокировки SQLite при одновременном доступе

При создании ворктри БД копируется из основного репо. Дальнейшие изменения в ворктри не влияют на основной репо и другие ворктри.

## pnpm и скорость установки

Проект использует **pnpm** вместо npm. Ключевое преимущество для ворктри:

- **Глобальный content-addressable store** — все пакеты хранятся один раз на диске (`~/AppData/Local/pnpm/store`)
- `pnpm install` в новом ворктри **не качает пакеты заново** — только создаёт hardlink'и из store
- Время установки: **1-2 секунды** вместо 30-60 секунд с npm

Настройка pnpm в проекте:
- `package.json` → `"pnpm": { "onlyBuiltDependencies": [...] }` — разрешённые build-скрипты
- `pnpm-lock.yaml` — коммитится в репо (аналог `package-lock.json`)
- `package-lock.json` — **удалён**, проект только на pnpm

## Создание нового ворктри (вручную)

Если нужно создать ворктри вручную (без Agent Manager):

```powershell
# 1. Создать ветку
git branch feature-xxx main

# 2. Создать ворктри
git worktree add .kilo/worktrees/feature-xxx feature-xxx

# 3. Запустить setup
$env:WORKTREE_PATH = "$PWD\.kilo\worktrees\feature-xxx"
$env:REPO_PATH = "$PWD"
.kilo\setup-script.ps1
```

## Удаление ворктри

```powershell
# Удалить ворктри и ветку
git worktree remove .kilo/worktrees/feature-xxx
git branch -D feature-xxx
```

Agent Manager делает это автоматически при удалении сессии.
