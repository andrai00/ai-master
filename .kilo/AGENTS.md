# ai-master

Проект на Next.js 16 + React 19 + TypeScript + Ant Design.
FSD-архитектура. Серверные экшены вместо API-роутов. Prisma + SQLite. Пакетный менеджер: **pnpm**.

> **`.kilo/` — частично в git.** Файлы конфигурации Kilo-агента (AGENTS.md, command/, skills/, .gitignore, package.json) отслеживаются git'ом. НЕ отслеживаются: `agent-manager.json` (локальное состояние), `worktrees/` (изолированные ветки), `node_modules/`. См. `.kilo/.gitignore`. Worktree-изоляция **не применяется** к `.kilo/` — это общая директория на диске, не привязанная к git-веткам. Правки `.kilo/`-файлов из любого контекста (ворктри или мейн) изменяют одну и ту же директорию на диске и попадают в текущую ветку.

---

## SESSION START — прочитай перед началом работы

Перед внесением любых изменений агент ОБЯЗАН изучить:

| # | Документ | Когда читать |
|---|----------|-------------|
| 1 | `docs/GOLDEN-RULES.md` | Всегда первым — незыблемые законы проекта |
| 2 | `docs/ANTI-PATTERNS.md` | Перед написанием кода — каталог частых ошибок |
| 3 | `docs/CODING.md` | Перед написанием кода — конвенции и паттерны |
| 4 | `docs/planning/00-overview.md` | При входе в новую область |
| 5 | `docs/ARCHITECTURE.md` | При изменении структуры |
| 6 | `docs/SERVER-ACTIONS.md` | При создании API/форм |
| 7 | `docs/UI-DESIGN.md` | При создании UI-компонентов |
| 8 | `docs/INTERFACE-STRUCTURE.md` | При добавлении страниц/роутов |
| 9 | `.kilo/command/commit.md` | Перед каждым коммитом — формат сообщений |
| 10 | `docs/COMPLETION-GATE.md` | Перед каждым коммитом — чеклист |
| 11 | `.kilo/command/merge-to-main.md` | Перед мержем в main |
| 12 | `docs/incidents.md` | Перед работой в области где были баги |

---

## Documentation Map

| Документ | Содержит | Приоритет |
|----------|---------|-----------|
| `docs/GOLDEN-RULES.md` | 43 незыблемых правила (G1..G43) | Высший |
| `docs/ANTI-PATTERNS.md` | Каталог ошибок: Bad → Why → Good | Высокий |
| `docs/CODING.md` | Конвенции: Server Actions, БД, стили, авторизация, FSD, типы | Высокий |
| `docs/planning/` | Планирование: концепция, стек, архитектура, агенты, роадмап | Средний |
| `docs/ARCHITECTURE.md` | Каноническая FSD + React Query | Средний |
| `docs/SERVER-ACTIONS.md` | Server Actions vs API Routes, Ant Design | Средний |
| `docs/INTERFACE-STRUCTURE.md` | Раскладка UI, страницы, компоненты | Средний |
| `docs/UI-DESIGN.md` | Дизайн-система: сайдбар, чат, формы, таблицы | Средний |
| `docs/COMPLETION-GATE.md` | Чеклист перед коммитом | Высокий |
| `.kilo/command/commit.md` | Правила коммит-сообщений: заголовок + подробное тело | Высокий |
| `.kilo/command/merge-to-main.md` | Правила влития в main: переименование ветки, merge не cherry-pick | Высокий |
| `docs/incidents.md` | Журнал багов и инцидентов | Средний |

---

## Skill Registry

| Навык | Файл | Trigger phrases |
|-------|------|----------------|
| DB & Migrations | `skills/db-migrations/SKILL.md` | "add model", "create migration", "change schema", "prisma" |
| Builder Agent | `skills/builder-agent/SKILL.md` | "builder", "agent tools", "builder-runner", "system prompt" |
| UI Component | `skills/ui-component/SKILL.md` | "create component", "add page", "build form", "add button" |
| Auth Flow | `skills/auth-flow/SKILL.md` | "login", "auth", "session", "setup", "password" |

---

## Алиасы и импорты

- `@/*` → корень репозитория
- Импорты: `@/src/widgets/shell`, `@/src/shared/lib/db/prisma`
- Относительные импорты только `./` в пределах слайса

---

## Work Patterns — что ДЕЛАТЬ

- **React Query** — только через хуки в `src/shared/api/{domain}/use-*.ts`, не напрямую в компонентах
- **useMutation** на все серверные экшены (create, update, delete) с инвалидацией кэша
- **Деструктивные действия** — с `Popconfirm` или `modal.confirm` из `App.useApp()`
- **Синглтоны** — `ActiveGame`, `AppConfig`: upsert + globalThis-кэш как у `getPrisma()`
- **Prisma** — `db push` для структурных изменений, `generate` после изменений
- **Builder Agent** — fire-and-forget + Socket.IO, не ждать ответа в server action
- **Socket.IO-push** — для фич затрагивающих всех пользователей (смена игры, режима, доступа)
- **Моки/сиды** — временный GET-роут, открыть URL, удалить роут
- **Ручные манипуляции с БД** — `sqlite3` или `npx prisma db execute --stdin`. В worktree — только с БД ворктри (prisma-клиент указывает на неё автоматически через `DATABASE_URL`, но для `sqlite3` путь к файлу БД — относительно текущей worktree-директории)
- **pnpm** — единственный пакетный менеджер проекта. `pnpm add`, `pnpm install`, `pnpm exec`. `package-lock.json` удалён.
- **Схема БД** — до перезапуска dev-сервера: `pnpm exec prisma db push && pnpm exec prisma generate`. Миграции-файлы не используются (нет прода) — схема применяется через `db push`
- **Мерж в main** — перед мержем переименовать ветку в `type/summary-text`, всегда merge (--no-ff), никогда cherry-pick. См. `.kilo/command/merge-to-main.md`
- **Worktree изоляция** — при работе в worktree (рабочая директория внутри `.kilo/worktrees/` или задан `WORKTREE_PATH`) все правки файлов ТОЛЬКО в пределах worktree. Запрещено редактировать файлы основного репозитория. Если правка нужна и в мейне — сначала смержить ветку worktree, потом править мейн отдельно. Исключение: `.kilo/` — общая директория, не привязана к веткам, её можно редактировать из любого контекста.<br>**БД ворктри и мейна — разные!** У каждого ворктри своя SQLite-база (через `DATABASE_URL` в `.env`). Никогда не подключайся к БД основного репозитория из ворктри — и наоборот. Для `sqlite3` всегда указывай путь к БД относительно текущей worktree-директории.<br>**`docs/` — часть git-репозитория!** Все изменения в `docs/GOLDEN-RULES.md`, `docs/ANTI-PATTERNS.md`, `docs/incidents.md` и других файлах документации делаются ТОЛЬКО в директории ворктри, как и любой другой код. Это не `.kilo/`-файлы — они отслеживаются git и привязаны к ветке.<br>**Правильный путь к файлам в ворктри:** рабочая директория уже установлена в корень ворктри (например `.kilo/worktrees/obsidian-hornet/`). ВСЕ операции с файлами (read, edit, write, bash, glob, grep) должны использовать ОТНОСИТЕЛЬНЫЕ пути (`docs/...`, `src/...`, `.kilo/...`) — они автоматически разрешаются в ворктри. НИКОГДА не использовать абсолютные пути вида `C:\Users\...\ai-master\docs\...` — это ведёт к правкам в основном репозитории вместо ворктри.

---

## Commit Convention

См. `.kilo/command/commit.md` — подробные правила.

- **Формат:** `type(scope): краткое описание` + пустая строка + подробное тело
- **Types:** `feat`, `fix`, `refactor`, `chore`, `style`, `docs`, `build`
- **Scope:** область изменений (chat, builder, auth, ui, db, i18n, sidebar, admin)
- **Заголовок:** English, imperative mood, ≤72 символов
- **Тело обязательно:** что сделано, почему, какие файлы, решения
- Коммитить ТОЛЬКО по явной просьбе пользователя

---

## Что агенту ЗАПРЕЩЕНО

- Запускать dev-сервер — пользователь делает это сам
- Создавать API Routes без необходимости — по умолчанию Server Actions
- Импортировать внутренности чужого слайса — только через public API (`index.ts`)
- Добавлять правила без подтверждения — сначала предложи в чате
- Игнорировать SESSION START checklist
- Редактировать файлы основного репозитория при работе в worktree
