# Golden Rules — незыблемые законы проекта

> Нарушение любого из этих правил = баг или архитектурный дефект.
> Правила нумеруются (G1..G20) для ссылок: «нарушено G8».

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
