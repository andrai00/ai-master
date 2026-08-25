# Команды проекта

> Пакетный менеджер — **pnpm** (единственный).

## Установка и запуск

```sh
pnpm install                          # установка зависимостей
pnpm dev                              # dev-сервер (node server.mjs, порт 3015)
pnpm build                            # next build
pnpm start                            # production (node server.mjs)
```

## Проверки

```sh
pnpm lint                             # ESLint
pnpm test                             # Vitest
pnpm exec tsc --noEmit                # проверка типов
```

## База данных (Prisma + SQLite)

```sh
pnpm exec prisma db push              # применить схему к БД (без миграций-файлов)
pnpm exec prisma generate             # сгенерировать клиент в src/generated/prisma
pnpm exec prisma db execute --stdin   # произвольный SQL
pnpm exec prisma studio               # GUI по таблицам
sqlite3 data/ai-master.db "SELECT ..."  # прямые SQL-запросы
```

**Порядок после изменения схемы:** `pnpm exec prisma db push && pnpm exec prisma generate` — ДО перезапуска dev-сервера.

## Утилиты

```sh
git status / git log / git diff       # git (коммиты только по просьбе пользователя)
```
