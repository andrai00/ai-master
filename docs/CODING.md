# Правила кодинга: ai-master

> **См. также:**
> - `docs/GOLDEN-RULES.md` — 20 незыблемых правил (G1..G20), нарушение = баг
> - `docs/ANTI-PATTERNS.md` — каталог ошибок: Bad → Why → Good
> - `docs/COMPLETION-GATE.md` — чеклист перед коммитом

## Документация проекта

Перед внесением изменений изучи соответствующий документ:

| Документ | Когда читать |
|---|---|
| `docs/planning/00-overview.md` | Общая картина проекта |
| `docs/planning/01-concept.md` | Концепция: агенты, режимы, категории данных, чаты |
| `docs/planning/02-tech-stack.md` | Технологический стек |
| `docs/planning/03-architecture.md` | Prisma-схема, БД, сессии, память чатов, изоляция |
| `docs/planning/04-agents.md` | Устройство агентов: Builder, Game Master, контекст |
| `docs/planning/06-roadmap.md` | Порядок разработки, текущий этап |
| `docs/ARCHITECTURE.md` | Каноническая FSD + React Query (переопределено: Server Actions вместо axios) |
| `docs/SERVER-ACTIONS.md` | ⚠️ Server Actions вместо axios, Ant Design вместо UI-библиотек |
| `docs/INTERFACE-STRUCTURE.md` | Раскладка UI, страницы, компоненты |
| `docs/UI-DESIGN.md` | 🎨 Дизайн-система: сайдбар, чат, формы, таблицы, модалки |

## Server Actions

Все мутации и запросы данных — через Server Actions в `src/shared/actions/{domain}/`.

```ts
"use server";
export async function loginAction(login: string, password: string) { ... }
```

**Когда Server Actions, когда API Routes:**

| Серверные экшены | API Routes (`route.ts`) |
|---|---|
| Мутации (create, update, delete) | Загрузка файлов (>1MB body) |
| Запросы данных из RSC | Webhook-обработчики |
| Формы, авторизация | Стриминг больших данных |
| 99% серверной логики | Когда нужен свой bodySizeLimit |

Правило: по умолчанию Server Action. API Route — только если Server Action не подходит (body > 1MB, стриминг, свой парсинг).

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

### Вызов из клиента

```tsx
"use client";
const result = await loginAction(login, password);
```

Клиентские хуки `use-*.ts` **обязаны лежать** в `src/shared/api/{domain}/` рядом с экшенами.
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

### Именование

- Функция: `{verb}{Entity}Action` — `loginAction`, `getProfileAction`
- Файл: `{verb}-{entity}.ts` — `login.ts`, `get-profile.ts`

## База данных

- **Prisma 7 + SQLite** — все данные
- Файл: `data/ai-master.db` (DATABASE_URL в `.env`)
- Синглтон: `src/shared/lib/db/prisma.ts` через `globalThis`
- Миграции: `npx prisma migrate dev --name <name>`
- Схема: `prisma/schema.prisma`
- Клиент: `import { getPrisma } from "@/src/shared/lib/db/prisma"`

## Авторизация

- JWT через `jose`, кука `session_token` (httpOnly)
- bcryptjs, 10 раундов
- Пользователи создаются админом, без саморегистрации
- Middleware в `src/middleware.ts`: всё кроме `/login`, `/setup` защищено

## FSD-архитектура

Импорты сверху вниз: `app-layer → pages-layer → widgets → features → entities → shared`.
Public API слайса только через `index.ts`.

```
{slice}/
  ui/         — компоненты
  model/      — типы, схемы
  api/        — http + use-хуки
  index.ts    — public API
```

## Ant Design

- Тёмная тема: `ConfigProvider` + `theme.darkAlgorithm` в `src/app-layer/index.tsx`
- Локаль: `ruRU`
- Цвета через CSS-переменные (`--border`, `--bg-surface`, `--text-primary`)
- Без синего акцента — нейтральные серые тона

## Стили

- CSS Modules рядом с компонентом
- `max-width: var(--content-width)` (760px)
- Скроллы 5px, тёмные
- Интерфейс интуитивно понятный: кнопки там где ожидаешь, действия очевидны
- Дизайн ориентирован на Notion/Obsidian: минимализм, тёмная тема, чёткая иерархия, без лишних украшений
- Иконки: только Ant Design (`@ant-design/icons`), без эмодзи
- Формы: input + кнопка рядом — высота кнопки = `controlHeight` из темы (30px), `align-items: center`, инпут без фиксированной высоты

## Интернационализация (i18n)

- Библиотека: `i18next` + `react-i18next`
- Все статические тексты в `src/shared/config/i18n/locales/{ru,en}.json`
- Ключи по секциям: `common`, `sidebar`, `profile`, `settings`, `auth`, `chat`, etc.
- Хук: `const { t } = useTranslation()` → `t("auth.login")`
- Язык по умолчанию: браузер → английский
- Переключение через Select в модалке настроек
- Динамический контент (имена, названия из БД) — НЕ переводить

## Типы и соглашения

- Интерфейсы: префикс `I` — `IUser`, `IForm`
- Enum: префикс `E` — `EUserRole`
- Хуки: `useXxx`
- Компоненты: `kebab-case.tsx`
- Файлы хуков: `camelCase.ts`

## Адаптивность

Всегда учитывать мобильную версию при создании UI-компонентов:

- Брейкпоинт: 768px (`@media (max-width: 767px)`)
- На мобилке сайдбар — drawer-шторка, таб-бар скрыт, только текущий контент
- Кнопки/инпуты — достаточного размера для тапа (минимум 32px)
- Контент не должен вылезать за пределы экрана на узких ширина
- Тестировать оба режима в коде — добавлять `@media` блоки в CSS Modules

## Конфигурация Next.js

- Защита роутов в `src/proxy.ts` (НЕ `middleware.ts` — переименовано в Next.js 16)

## Обязательные практики

### Каждый UI-компонент — сразу с адаптивом
Не откладывать. Колонки таблиц с `responsive`, padding на мобилке, `flexWrap` у хедеров, иконка-онли кнопки на узких экранах.

### Каждая иконка-онли кнопка — с Tooltip
`<Tooltip title="..."><Button icon={...} /></Tooltip>`. Без исключений.

### Деструктивные действия — с подтверждением
`Popconfirm` для удаления, `modal.confirm` из `App.useApp()` для выхода/смены.

### Danger / красный только для удаления
`type="primary" danger` и красный цвет — только для необратимых действий (удаление, сброс). Для выхода из режима, возврата, закрытия — обычные кнопки, не danger.

### modal.confirm — всегда mask: { closable: true }
`modal.confirm` из `App.useApp()` по умолчанию не закрывается по клику на фон. Всегда добавлять `mask: { closable: true }` чтобы модалку можно было закрыть кликом мимо (новый API Ant Design v5+).

### Проверка TypeScript и ESLint после изменений
После внесения правок в несколько файлов — запустить `npx tsc --noEmit` и `npx next lint`. Не полагаться только на билд-ошибки в браузере — они показывают не всё. Особенно после массовых изменений интерфейсов или серверных экшенов.

### Режимы с последствиями — кнопка + подтверждение, не Switch
`Switch` — только для мгновенных toggle без последствий (тема, звук). Смена режима, затрагивающая всех пользователей или меняющая поведение системы — только кнопка с явным текстом (`Button` + текст действия) + `modal.confirm` с объяснением что произойдёт.

### Таблицы — всегда pagination
Даже если данных мало: `pagination={{ pageSize: 10, hideOnSinglePage: true }}`. Не `pagination={false}`.

### Строки JSON-локалей — всегда с trailing comma
```json
"key": "value",
"lastKey": "value"
```
Последний элемент секции без запятой. Все остальные с запятой.

### Цвета — только CSS-переменные
`var(--border)`, `var(--text-primary)`, `var(--bg-hover)`, `var(--text-dim)`. Никаких `#333`, `#d4d4d4`, `#1a1a1a`.

### Нотификации и заголовки — только через i18n
Все `notification.success({ title: ... })`, `Modal title`, `placeholder`, `Tooltip title` — через `t()`. Исключение: динамические данные из БД.

### Миграция Prisma — до перезапуска dev-сервера
`npx prisma migrate dev --name <name> && npx prisma generate` до тестирования. Иначе `globalThis` + старый клиент = баги.

### Нашёл повторяющуюся проблему → предложи записать как правило
Если замечаешь паттерн ошибок — предложи в чате добавить правило. НЕ добавляй без подтверждения.

### Моки/сиды для теста → временный API-роут
Если нужны тестовые данные — временный GET-роут в `src/app/api/seed-{name}/route.ts`. Пользователь открывает URL, данные создаются, роут удаляется.

### Ручные манипуляции с БД → `sqlite3`
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

### Фичи затрагивающие всех пользователей → SSE-подписка
Если фича меняет состояние которое должны увидеть все подключённые пользователи (смена игры, смена режима, потеря доступа, глобальные события) — делаем SSE-push, а не полагаемся на опрос каждым клиентом.

Паттерн:
1. **API Route** `src/app/api/{event}-events/route.ts` — `ReadableStream`, `text/event-stream`, пушит события
2. **Клиент** — `EventSource` в `useEffect`, слушает события и реагирует (редирект, `queryClient.invalidateQueries`, обновление UI)
3. **Триггер** — Server Action при мутации дополнительно вызывает broadcast через глобальный EventEmitter или общую очередь

Пример существующей реализации: `src/app/api/game-events/route.ts` + подписка в `src/widgets/shell/ui/shell.tsx`.

### Builder Agent: fire-and-forget + SSE

Сообщение AI — долгий процесс (до 2 мин). Нельзя заставлять Server Action ждать. Паттерн:

1. **Отправка:** Server Action сохраняет сообщение в БД → запускает `runBuilderAgent()` **без await** → сразу возвращает `{ success: true }`
2. **Получение:** ответ AI и прогресс — через SSE (`/api/builder/steps`). Все клиенты (включая отправителя) получают одинаково
3. **SSE всегда подключён** — клиент подключается при заходе на страницу, не только при отправке
4. **Типы SSE-событий:** `started`, `step`, `stopping`, `done`, `stopped`, `error`

### Builder Agent: остановка (Stop)

Три слоя прерывания должны срабатывать одновременно:

```ts
// При нажатии Stop:
cancelAll();            // глобальный флаг, все тулы проверяют throwIfCancelled()
stopProcessing(sessionId); // ac.abort() — прерывает HTTP-запросы модели
```

Каждый tool обязан начинаться с `throwIfCancelled()`. Инструменты задержки (ожидание парсинга файла) проверяют флаг каждые 100ms.

### Builder Agent: сжатие контекста

Использовать `prepareStep` в `generateText`. Хук вызывается перед каждым шагом:
- Оценить токены (`сообщения.length / 4`)
- Сравнить с `contextLimit × 0.7` (из AppConfig, авто-дефолт по провайдеру)
- При превышении: оставить system + последнее сообщение админа + **текущий tool-шаг** (не сжимать!), остальное заменить на саммари

### Builder Agent: ретраи

`generateText` в цикле до 5 попыток, экспоненциальный backoff. Ретраить только transient (сеть, Invalid JSON). НЕ ретраить AbortError, ошибки конфигурации.

### Builder Agent: метки шагов в бабле

Тул-имена не показываются пользователю. Вместо `create_document` — человекочитаемая фраза из пула вариантов:

- **i18n:** ключ `builder.steps.{tool}` → значение типа `string | string[]`
- Если массив — выбирается случайная фраза, **не повторяющая предыдущую** (хранится в `lastLabelRef`)
- Если строка — всегда она
- Фразы должны описывать что ИИ делает в бизнес-терминах: «Прописывает глоссарий», а не «Вызывает create_document»

Пример конфигурации в `ru.json`:
```json
"steps": {
  "read_parsed_file": ["Изучает правила", "Разбирает книгу", "Читает материал"],
  "create_document": ["Прописывает глоссарий", "Формирует базу правил"],
  "update_document": ["Дополняет запись", "Уточняет данные"],
  "search_documents": ["Ищет в базе", "Проверяет справочник"]
}
```

### Prisma: @updatedAt в SQLite требует @default(now())
`@updatedAt` без `@default(now())` ломает `db push` — SQLite не умеет авто-заполнять новые колонки существующих строк. Всегда: `updatedAt DateTime @default(now()) @updatedAt`.

### Доступ к страницам — проверка режима игры
Dev-страницы (`/admin/builder`, `/admin/documents`, `/admin/logs`) должны проверять не только роль, но и режим:
```ts
const activeGame = await getActiveGame();
if (activeGame?.mode !== "development") redirect("/");
```
В game-режиме админ не может открыть эти страницы — редирект на `/`.

### Активная страница в сайдбаре — usePathname
Все навигационные элементы сайдбара должны подсвечивать активную страницу:
```ts
const pathname = usePathname();
const isActive = (route: string) => pathname.startsWith(route);
// className={`${styles.row} ${isActive("/admin/users") ? styles.rowActive : ""}`}
```
Активный стиль: `background: var(--bg-active); color: var(--text-primary);`. Каждый новый пункт меню — сразу с этим.
