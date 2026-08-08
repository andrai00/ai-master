# Golden Rules — незыблемые законы проекта

> Нарушение любого из этих правил = баг или архитектурный дефект.
> Правила нумеруются (G1..G28) для ссылок: «нарушено G8».

---

## G1 — Server Actions по умолчанию

**Суть:** все мутации и запросы данных — через Server Actions. API Routes — только когда Server Action не подходит.

**Когда API Route:**
- Загрузка файлов >1MB body
- Webhook-обработчики
- Стриминг больших данных
- Когда нужен свой `bodySizeLimit`

**Нарушение:** создание `route.ts` для обычного CRUD.

---

## G2 — Синглтон через globalThis

**Суть:** НИКОГДА `let` на уровне модуля для кэша. Только `globalThis`-паттерн:

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

**Почему:** при горячей перезагрузке Next.js `let` теряется.

---

## G3 — Цвета только через CSS-переменные

**Суть:** никаких `#333`, `#d4d4d4`, `#1a1a1a`, `rgb(...)`. Только `var(--border)`, `var(--bg-surface)`, `var(--text-primary)`.

**Нарушение:** любой хардкод цвета.

---

## G4 — Все статические тексты через i18n

**Суть:** `title`, `placeholder`, `Tooltip`, `Modal`, `notification` — через `t()`. Исключение: динамические данные из БД.

```tsx
const { t } = useTranslation();
t("auth.login")
```

**Нарушение:** русский или английский текст в `title="..."` или `placeholder="..."`.

---

## G5 — Иконка-онли кнопка всегда с Tooltip

**Суть:** `<Tooltip title={t("...")}><Button icon={...} /></Tooltip>`. Без исключений.

**Нарушение:** `<Button icon={<DeleteOutlined />} />` без обёртки.

---

## G6 — Таблицы всегда с pagination

**Суть:** `pagination={{ pageSize: 10, hideOnSinglePage: true }}`. Никогда `pagination={false}`.

**Нарушение:** `pagination={false}`.

---

## G7 — Деструктивные действия с подтверждением

**Суть:** `Popconfirm` для удаления, `modal.confirm` из `App.useApp()` для выхода/смены.

**Нарушение:** удаление без подтверждения.

---

## G8 — Danger/красный только для удаления

**Суть:** `type="primary" danger` — только для необратимых действий (удаление, сброс). Выход, возврат, закрытие — обычные кнопки.

**Нарушение:** красная кнопка «Cancel» или «Back».

---

## G9 — modal.confirm с mask: { closable: true }

**Суть:** `modal.confirm` из `App.useApp()` не закрывается по клику на фон по умолчанию. Всегда `mask: { closable: true }`.

**Нарушение:** модалка, которую нельзя закрыть кликом мимо.

---

## G10 — React Query только через хуки

**Суть:** компонент не использует `useQuery`/`useMutation` напрямую. Только через хуки в `src/shared/api/{domain}/use-*.ts`.

```tsx
// В компоненте:
import { useListGames } from "@/src/shared/api/admin/use-list-games";
const { data: games } = useListGames();
```

**Нарушение:** `useQuery` напрямую в компоненте.

---

## G11 — useMutation на все мутации

**Суть:** create, update, delete — всегда через `useMutation` + `queryClient.invalidateQueries`.

**Нарушение:** прямой вызов server action без `useMutation`.

---

## G12 — Проверка TypeScript и ESLint после изменений

**Суть:** после правок в несколько файлов: `npx tsc --noEmit` и `npx next lint`.

**Нарушение:** коммит без проверки типов и линтера.

---

## G13 — Режимы с последствиями — кнопка + подтверждение, не Switch

**Суть:** `Switch` — только для мгновенных toggle (тема, звук). Смена режима игры — `Button` + `modal.confirm`.

**Нарушение:** Switch для переключения development/game mode.

---

## G14 — Prisma @updatedAt требует @default(now()) в SQLite

**Суть:** `updatedAt DateTime @default(now()) @updatedAt`. Без `@default(now())` ломает `db push`.

**Нарушение:** `updatedAt DateTime @updatedAt` без `@default(now())`.

---

## G15 — Dev-страницы только в development-режиме

**Суть:** `/admin/builder`, `/admin/documents`, `/admin/logs` — проверять `getActiveGame().mode !== "development" → redirect("/")`.

**Нарушение:** доступ к dev-страницам в game-режиме.

---

## G16 — Активная страница в сайдбаре через usePathname

**Суть:** `const isActive = (route: string) => pathname.startsWith(route)`. Активный стиль: `background: var(--bg-active)`.

**Нарушение:** новый пункт меню без подсветки активной страницы.

---

## G17 — Миграция Prisma до перезапуска dev-сервера

**Суть:** `npx prisma migrate dev --name <name> && npx prisma generate` до тестирования.

**Нарушение:** изменение схемы без `migrate dev` + `generate`.

---

## G18 — SSE-push для глобальных событий

**Суть:** смена игры, режима, потеря доступа — SSE-push всем клиентам, не полагаться на опрос.

**Нарушение:** клиент опрашивает сервер каждые N секунд вместо SSE.

---

## G19 — Builder Agent: fire-and-forget + SSE

**Суть:** server action сохраняет сообщение → запускает `runBuilderAgent()` без await → сразу возвращает `{ success: true }`. Прогресс и ответ — через SSE.

**Нарушение:** `await runBuilderAgent()` в server action (блокирует HTTP-запрос на 2 минуты).

---

## G20 — Коммиты только по явной просьбе

**Суть:** агент не коммитит самостоятельно. Только когда пользователь явно скажет «закоммить» или «сделай коммит».

**Нарушение:** авто-коммит после завершения задачи.

---

## G21 — AI-обработка только через очередь

**Суть:** `runBuilderAgent()` никогда не вызывается напрямую из server action. Только через `enqueueBuilderJob()` → `better-queue` (max 3 concurrent). Очередь персистентна через `BuilderJob` table, восстанавливается при рестарте.

**Почему:** без очереди 10+ одновременных `generateText()` забивают event loop, SQLite и память.

**Нарушение:** прямой вызов `runBuilderAgent()` в обход `enqueueBuilderJob()`.

---

## G22 — Импортированный контент полным текстом, не чанками

**Суть:** `.md` файлы из архива импортируются в `Document.content` одной записью на документ. Никаких чанков, никакого постраничного хранения.

**Почему:** запись чанков в БД = множественный SQLite write lock → блокирует страницы, server actions, SSE.

**Нарушение:** разбиение одного документа на множество записей в таблице.

---

## G23 — Импорт файлов через архив, не чанковое чтение

**Суть:** файлы загружаются как `.zip` архив с `.md` файлами (или одиночный `.md`). AI НЕ читает содержимое каждого файла — вместо этого `explore_archive()` показывает дерево папок с количеством файлов. AI определяет типы по структуре папок (не по контенту), затем `bulk_import_to_glossary` создаёт все Document'ы одной серверной операцией. Документы получают названия с путём: `classes/87-barbarian`, `rules/inventory/96-arms`. Все тулзы документов принимают и UUID и путь.

**Алгоритм:**
1. `explore_archive()` → дерево папок + sample-имена (первые 5 файлов)
2. AI определяет тип для каждой папки: `/classes/` → type: "class", `/spells/` → type: "spell", `/rules/` → type: "rule"
3. AI разделяет на справочные данные (class, spell, monster, item) и правила (rule)
4. Админ подтверждает → `bulk_import_to_glossary(typeMap)` создаёт все Document'ы
5. После импорта UploadedFile записи удалены, работает только с Document

**Почему:** чанковое чтение 8000 файлов требовало бы десятки тысяч AI-шагов. Определение типов по структуре папок + серверный `createMany` — O(1) AI-шагов + один SQL-запрос на папку.

**Нарушение:** чтение содержимого файлов при импорте архива (read_file в цикле).

---

## G24 — SSE-push для всех мутаций чата между клиентами

**Суть:** удаление/создание сообщений, затрагивающие других админов — всегда через `broadcastGameEvent()` + SSE-push. Не полагаться на React Query (он per-client).

**Почему:** React Query cache — per-browser. Invalidate на админе A не триггерит refetch на админе B. Только SSE гарантирует синхронизацию.

**Нарушение:** мутация чата без `broadcastGameEvent`.

---

## G25 — Все страницы используют единый `<PageHeader>` компонент

**Суть:** каждая страница приложения рендерит `<PageHeader title="..." actions={...} />`. Запрещены inline-стили для заголовков, отдельные `h2`, самописные header-div'ы. Компонент находится в `src/shared/ui/page-header.tsx`.

**Почему:** без единого компонента дизайн шапок расходится (разные font-size, padding, border). Мобильная кнопка меню дублируется или отсутствует. Любое изменение шапки требует правок во всех страницах.

**Нарушение:** `<h2 style={{ fontSize: 16 }}>` или `<div className="pageHeader">` вместо `<PageHeader>`.

---

## G26 — Real-time только через EventEmitter push, никакого polling

**Суть:** SSE-эндпоинты не опрашивают буфер через `setTimeout`. Вместо этого используют `EventEmitter` + подписку (`onStep`, `onGameEvent`). Источник данных (step-tracker, game-events) пушит события подписчикам мгновенно.

**Почему:** `setTimeout(poll, 300)` создаёт задержку 0-300ms, ломает синхронизацию между клиентами (отправитель получает событие позже чем другие). EventEmitter доставляет мгновенно — все клиенты получают событие в одной итерации event loop.

**Нарушение:** `setTimeout` в SSE-роуте для опроса источника данных.

---

## G27 — DB-update перед broadcast всегда с `await`

**Суть:** если действие меняет БД и затем шлёт SSE-событие другим клиентам через `broadcastGameEvent` — БД-запись должна быть завершена ДО броадкаста. `prisma.x.update().catch()` без `await` создаёт гонку: broadcast уходит до коммита, рефетч возвращает старые данные.

**Почему:** без `await` клиент получает SSE-событие, рефетчит запрос, но БД ещё не обновлена → видит старое значение. Пользователь видит рассинхрон между баблом и данными.

**Нарушение:** `prisma.document.update(...).catch(() => {})` без `await` перед `broadcastGameEvent`.

---

## G28 — Инструменты LLM-агента не фильтруются по режиму

**Суть:** все тулзы (`explore_archive`, `search_documents`, `create_document`, и т.д.) всегда доступны агенту. Режим (IMPORT / CHAT) регулируется через system prompt, а не через скрытие тулзов. Все инструменты документов принимают и UUID и путь. Агент сам решает когда использовать импорт-тулзы на основе инструкций в промпте.

**Почему:** условное скрытие тулзов ломает TypeScript-типизацию `generateText<typeof tools>`. Промпт-инструкции надёжнее и не требуют union types.

**Нарушение:** `if (isImport) tools.explore_archive = ...` — добавление/удаление тулзов из объекта в рантайме.
