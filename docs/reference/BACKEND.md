# Backend-конвенции: ai-master

> **См. также:**
> - `docs/reference/GOLDEN-RULES.md` — незыблемые правила (G1..G43), нарушение = баг
> - `docs/reference/ANTI-PATTERNS.md` — каталог ошибок: Bad → Why → Good
> - `docs/reference/ARCHITECTURE.md` — каноническая FSD
> - `docs/reference/AGENT-RUNTIME.md` — раннеры AI-агентов (Builder, Game Master)
> - `docs/reference/COMMANDS.md` — все команды проекта

## Server Actions

Все мутации и запросы данных — через Server Actions в `src/shared/actions/{domain}/`.

```ts
"use server";
export async function loginAction(login: string, password: string) { ... }
```

### Когда Server Actions, когда API Routes

| Серверные экшены | API Routes (`route.ts`) |
|---|---|
| Мутации (create, update, delete) | Загрузка файлов (>1MB body) |
| Запросы данных из RSC | Webhook-обработчики |
| Формы, авторизация | Стриминг больших данных |
| 99% серверной логики | Когда нужен свой bodySizeLimit |

Правило: по умолчанию Server Action. API Route — только если Server Action не подходит (body > 1MB, стриминг, свой парсинг).

### Почему Server Actions (а не axios/httpServer)

- Нет отдельного API-роута — экшен это просто функция, вызывается как обычный async-вызов из клиентского кода или RSC.
- Next.js сам сериализует аргументы и ответ (через React Flight).
- Прогрессивное улучшение: работает без JS (формы).
- Токен и сессия читаются напрямую из `cookies()` / `headers()` — не нужно проксировать через axios-interceptor.

Экшены — **серверный код**, помечены `"use server"`. Лежат в `shared/`, потому что это общий слой данных, доступный из любого слайса.

### Контракт экшена

Каждый файл экспортирует одну асинхронную функцию:

```ts
"use server";

import { verifySession } from "@/src/shared/lib/session";
import { cookies } from "next/headers";

export const getProfileAction = async (): Promise<IUser> => {
  const session = await verifySession();
  if (!session) throw new Error("Unauthorized");
  // ...
};
```

### Именование

- Функция: `{verb}{Entity}Action` — `loginAction`, `getProfileAction`
- Файл: `{verb}-{entity}.ts` — `login.ts`, `get-profile.ts`

### Ревалидация кэша

После мутации экшен вызывает `revalidatePath()` или `revalidateTag()`.

### Синглтон через globalThis

Использовать `globalThis`-паттерн для всех синглтонов. Никаких `let` на уровне модуля.

```ts
const globalX = globalThis as unknown as {
  instance: Thing | undefined;
  promise: Promise<Thing> | undefined;
};

export async function getThing(): Promise<Thing> {
  if (globalX.instance) return globalX.instance;
  if (!globalX.promise) globalX.promise = createThing();
  globalX.instance = await globalX.promise;
  return globalX.instance;
}
```

### Клиентские хуки `use-*.ts`

Клиентские хуки **обязаны лежать** в `src/shared/api/{domain}/` рядом с экшенами.
Компонент не использует `useQuery`/`useMutation` напрямую — только через хук.

```tsx
// src/shared/api/admin/use-list-games.ts
import { useQuery } from "@tanstack/react-query";
import { listGamesAction } from "@/src/shared/actions/admin/games";

export function useListGames() {
  return useQuery({ queryKey: ["admin", "games"], queryFn: listGamesAction });
}

// В компоненте:
import { useListGames } from "@/src/shared/api/admin/use-list-games";
const { data: games } = useListGames();
```

Хук — тонкая обёртка: `useQuery`/`useMutation` + инвалидация кэша при мутациях (`queryClient.invalidateQueries`).

### useQuery / useMutation с серверным экшеном

```ts
// src/shared/api/profile/use-get-profile.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { getProfileAction } from "@/src/shared/actions/profile/get-profile";

export const useGetProfile = () =>
  useQuery({
    queryKey: ["getProfileAction"],
    queryFn: () => getProfileAction({}),
  });
```

```ts
// src/shared/api/characters/use-update-character-sheet.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notification } from "antd";
import { updateCharacterSheetAction } from "@/src/shared/actions/characters/update-character-sheet";

export const useUpdateCharacterSheet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCharacterSheetAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getCharacterSheetAction"] });
      notification.success({ message: "Лист обновлён" });
    },
    onError: () => {
      notification.error({ message: "Ошибка при обновлении листа" });
    },
  });
};
```

### RSC без React Query

В серверных компонентах (`layout.tsx`, `page.tsx` — если нужна предзагрузка) экшен вызывается напрямую.

### Клиентский `http` без изменений

Клиентский axios-инстанс `http` (`src/shared/api/instance.ts`) **остаётся** для случаев когда нужен прямой вызов из браузера (загрузка файлов, polling, стриминг).

## База данных

- **Prisma 7 + SQLite** — все данные
- Файл: `data/ai-master.db` (путь жёстко прописан в `src/shared/lib/db/prisma.ts`; `DATABASE_URL` в `.env` используется Prisma CLI)
- Синглтон: `src/shared/lib/db/prisma.ts` через `globalThis`
- Схема БД: `pnpm exec prisma db push` (миграции-файлы не используются, нет прода)
- Схема: `prisma/schema.prisma`
- Клиент: `import { getPrisma } from "@/src/shared/lib/db/prisma"`

### WAL-режим SQLite

`PRAGMA journal_mode=WAL` + `busy_timeout=5000` при инициализации Prisma (`prisma.ts`). Без WAL массовые записи агента блокируют чтения всего сайта (один файл БД). WAL-артефакты `data/*.db-wal`, `data/*.db-shm` — в `.gitignore`.

### Пакетные операции с БД

Массовые записи (импорт, обновление, сканирование) — пакетно: один `findMany` существующих + `createMany`/`updateMany` чанками по 500. Цикл `findFirst`+`create`/`update` на запись запрещён (тысячи запросов держат write-lock, замораживают сайт). Пример: `bulk-import.ts` — ~20 запросов вместо ~17 000.

### Prisma: @updatedAt в SQLite требует @default(now())

`@updatedAt` без `@default(now())` ломает `db push` — SQLite не умеет авто-заполнять новые колонки существующих строк. Всегда: `updatedAt DateTime @default(now()) @updatedAt`.

### Схема Prisma — до перезапуска dev-сервера

`pnpm exec prisma db push && pnpm exec prisma generate` до тестирования. Иначе `globalThis` + старый клиент = баги.

### Ручные манипуляции с БД

Для прямых SQL-запросов к SQLite (проверка данных, отладка):
```
sqlite3 data/ai-master.db "SELECT ..."
```
```sh
sqlite3 data/ai-master.db ".tables"
sqlite3 data/ai-master.db ".schema Document"
```

Альтернатива — `npx prisma db execute --stdin` (если sqlite3 недоступен).
Альтернатива 2 — GUI: `npx prisma studio` (открывает браузер с таблицами).
Не использовать `psql` (это PostgreSQL, а у нас SQLite).

### Моки/сиды для теста → временный API-роут

Если нужны тестовые данные — временный GET-роут в `src/app/api/seed-{name}/route.ts`. Пользователь открывает URL, данные создаются, роут удаляется.

## Авторизация

- JWT через `jose`, кука `session_token` (httpOnly)
- bcryptjs, 10 раундов
- Пользователи создаются админом, без саморегистрации
- Защита роутов в `src/proxy.ts` (НЕ `middleware.ts` — переименовано в Next.js 16): всё кроме `/login`, `/setup` защищено

### Доступ к dev-страницам — проверка режима игры

Dev-страницы (`/admin/builder`, `/admin/documents`, `/admin/logs`) должны проверять не только роль, но и режим:
```ts
const activeGame = await getActiveGame();
if (activeGame?.mode !== "development") redirect("/");
```
В game-режиме админ не может открыть эти страницы — редирект на `/`.

## Конфигурация Next.js

- `server.mjs` — кастомный entry point: Socket.IO на том же HTTP-сервере Next.js (WebSocket + long-polling fallback). Инстанс в `globalThis.__socketIO`
- `next.config.ts` — `serverExternalPackages: ["better-queue", "better-queue-memory", "adm-zip"]`, `experimental.proxyClientMaxBodySize: "150mb"`

## Real-time: Socket.IO push

Если фича меняет состояние которое должны увидеть все подключённые пользователи (смена игры, смена режима, потеря доступа, глобальные события) — делаем Socket.IO push, а не полагаемся на опрос каждым клиентом.

Паттерн:
1. **Сервер** — `server.mjs` (кастомный entry point): Socket.IO на том же HTTP-сервере Next.js. Инстанс в `globalThis.__socketIO`
2. **Хаб** — `src/shared/lib/realtime/server.ts`: auth по JWT-cookie, комнаты (`user:`, `steps:`, `session:`, `presence:`), presence, typing. Регистрируется один раз через `src/instrumentation.ts`
3. **Клиент** — `socket.io-client` в `src/shared/lib/realtime/client.ts` (единый сокет), Shell слушает `game:event` и реагирует (редирект, `queryClient.invalidateQueries`, обновление UI). Авто-реконнект + resync на `connect`
4. **Триггер** — Server Action при мутации вызывает `broadcastGameEvent` → `io.emit("game:event")`

Пример существующей реализации: `src/widgets/shell/ui/shell.tsx` + шина `src/shared/lib/realtime/client.ts` + `src/shared/lib/events/game-events.ts`.

### Правила Socket.IO

- Подписка на step-события обязана запрашивать комнату на сервере (`subscribe-steps`/`unsubscribe-steps`), а не полагаться на connect-time join
- Любая мутация чата/файлов затрагивающая других пользователей — всегда push (`broadcastGameEvent`)
