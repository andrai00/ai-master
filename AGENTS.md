# ai-master — routing index

> Канонический вход для людей и AI-агентов. Здесь **нет правил** — только карта проекта.
> Правила: `docs/reference/GOLDEN-RULES.md` и `docs/reference/ANTI-PATTERNS.md`.
> Правила агентской сессии: `.kilo/AGENTS.md` (приоритет в рамках сессии).

Next.js 16 + React 19 + TypeScript + Ant Design, FSD-архитектура, Server Actions вместо API-роутов, Prisma + SQLite, Socket.IO push, пакетный менеджер **pnpm**.

## I want to...

| Хочу | Прочитать | Дальше |
|---|---|---|
| Понять проект целиком | `docs/planning/00-overview.md`, `docs/planning/01-concept.md` | `docs/reference/ARCHITECTURE.md` |
| Написать серверный код | `docs/reference/BACKEND.md` | `docs/reference/GOLDEN-RULES.md` |
| Создать UI-компонент | `docs/reference/FRONTEND.md` | `docs/reference/FORMATTING.md` |
| Изменить схему БД | `docs/reference/COMMANDS.md`, скилл `db-migrations` | `docs/reference/GOLDEN-RULES.md` (G14, G17) |
| Поменять логику AI-агентов | `docs/reference/AGENT-RUNTIME.md` | `src/shared/lib/agents/`, скилл `builder-agent` |
| Добавить страницу/роут | `docs/reference/FRONTEND.md` | `.kilo/AGENTS.md` (SESSION START) |
| Закоммитить | `.kilo/command/commit.md`, `docs/reference/COMPLETION-GATE.md` | — |
| Смержить в main | `.kilo/command/merge-to-main.md` | — |
| Найти прошлые баги в области | `docs/incidents/README.md` | — |

## Documentation Map

| Документ | Содержит | Приоритет |
|---|---|---|
| `docs/reference/GOLDEN-RULES.md` | 43 незыблемых правила (G1..G43) | Высший |
| `docs/reference/ANTI-PATTERNS.md` | Каталог ошибок: Bad → Why → Good | Высокий |
| `docs/reference/BACKEND.md` | Server Actions, БД, авторизация, Socket.IO | Высокий |
| `docs/reference/FRONTEND.md` | Дизайн-система, UI-паттерны, интерфейс | Высокий |
| `docs/reference/AGENT-RUNTIME.md` | Раннеры Builder/GM, тулы, формулы, диагностика | Высокий |
| `docs/reference/FORMATTING.md` | Именование, типографика, i18n-формат | Средний |
| `docs/reference/LINTING.md` | tsc + ESLint проверки | Средний |
| `docs/reference/COMMANDS.md` | Все pnpm/prisma-команды | Средний |
| `docs/reference/ARCHITECTURE.md` | Каноническая FSD + React Query | Средний |
| `docs/reference/COMPLETION-GATE.md` | Чеклист перед коммитом | Высокий |
| `docs/reference/GLOSSARY.md` | Термины проекта | Средний |
| `docs/incidents/README.md` | Журнал багов и инцидентов (append-only) | Средний |
| `docs/planning/` | Концепция, стек, агенты, роадмап | Низкий |

## Skill Registry

| Навык | Файл | Trigger phrases |
|---|---|---|
| DB & Migrations | `.kilo/skills/db-migrations/SKILL.md` | "add model", "create migration", "change schema", "prisma" |
| Builder Agent | `.kilo/skills/builder-agent/SKILL.md` | "builder", "agent tools", "builder-runner", "system prompt" |
| UI Component | `.kilo/skills/ui-component/SKILL.md` | "create component", "add page", "build form", "add button" |
| Auth Flow | `.kilo/skills/auth-flow/SKILL.md` | "login", "auth", "session", "setup", "password" |

## Glossary Quick-Ref

| Термин | Значение |
|---|---|
| Builder | Агент-1. Изучает правила, настраивает мастера (dev-режим) |
| Game Master (GM) | Агент-2. Ведёт игру с игроками (game-режим) |
| Мастер / Игра | Экземпляр с правилами (glossary/brain) и доступом игроков |
| ActiveGame | Синглтон-таблица: какая игра активна для всех |
| Glossary | Категория: исходные правила игры |
| Brain / Мозг | Категория: инструкции ИИ для самого себя |
| Game hidden / visible | Скрытые заметки GM / данные игроков |
| Сессия | Чат: game (общий), personal (личный), builder (настройка) |
| Скил (skill) | Загружаемая инструкция для агента под сценарий |

Полный глоссарий: `docs/reference/GLOSSARY.md`.

## Top Commands

```sh
pnpm dev                          # dev-сервер (порт 3015)
pnpm build && pnpm start          # production
pnpm lint && pnpm test            # проверки
pnpm exec prisma db push && pnpm exec prisma generate   # после изменения схемы
```
