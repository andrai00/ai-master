# Anti-Patterns — каталог типовых ошибок

> Формат: **Bad** → **Why** → **Good**. Агент читает перед работой в соответствующей области.

---

## Server Actions & API

### Bad: создавать API Route для мутации
### Why: проект на Server Actions, API Routes — исключение. Смешивание создаёт две параллельные парадигмы.
### Good: `"use server"; export async function myAction(...) { ... }`

### Bad: импортировать axios / fetch для запросов к своему же бэкенду
### Why: проект на Server Actions + Prisma, нет отдельного API. Axios создаёт ненужный HTTP-слой.
### Good: `import { getPrisma } from "@/src/shared/lib/db/prisma"` — прямой доступ к БД из server action

---

## Prisma & Database

### Bad: `prisma migrate reset`
### Why: дропает ВСЕ данные. Категорически запрещено.
### Good: `prisma db push` (без потери данных), затем `prisma migrate diff` если нужна миграция

### Bad: `let prisma: PrismaClient` на уровне модуля
### Why: горячая перезагрузка Next.js теряет состояние модуля — создаются лишние соединения.
### Good: `globalThis`-паттерн: `const globalPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }`

### Bad: `updatedAt DateTime @updatedAt` без `@default(now())`
### Why: SQLite не умеет авто-заполнять новые колонки существующих строк → `db push` падает.
### Good: `updatedAt DateTime @default(now()) @updatedAt`

### Bad: запускать код без `prisma generate` после изменения схемы
### Why: старый Prisma-клиент не знает о новых полях → `globalThis` кэширует устаревший клиент.
### Good: `npx prisma migrate dev --name <name> && npx prisma generate` → затем перезапустить dev-сервер

---

## FSD-архитектура

### Bad: импортировать внутренности чужого слайса
### Why: ломает изоляцию, создаёт неявные зависимости, мешает рефакторингу.
### Good: `import { Thing } from "@/src/features/chat-panel"` — через public API (`index.ts`)

### Bad: относительный импорт между слайсами (`../../features/...`)
### Why: ломается при перемещении файла, нечитаемо.
### Good: `@/src/features/chat-panel` — абсолютный импорт через алиас

---

## React Query

### Bad: `useQuery` / `useMutation` напрямую в компоненте
### Why: логика запроса размазана по компоненту, нельзя переиспользовать, сложно тестировать.
### Good: тонкий хук в `src/shared/api/{domain}/use-*.ts`, компонент использует хук

### Bad: прямой вызов server action без `useMutation`
### Why: нет инвалидации кэша, нет состояний loading/error, нет optimistic update.
### Good: хук с `useMutation` + `queryClient.invalidateQueries`

---

## UI / Ant Design

### Bad: иконка-онли кнопка без `<Tooltip>`
### Why: пользователь не понимает что делает кнопка, нет accessibility.
### Good: `<Tooltip title={t("delete")}><Button icon={<DeleteOutlined />} /></Tooltip>`

### Bad: `pagination={false}`
### Why: на 100+ записей таблица становится неюзабельной, нет контроля над размером страницы.
### Good: `pagination={{ pageSize: 10, hideOnSinglePage: true }}`

### Bad: Danger-кнопка для не-деструктивного действия
### Why: пользователь ожидает что красная кнопка что-то удалит/сломает. «Cancel» красным цветом — обман.
### Good: `type="primary" danger` — только для delete, reset, remove. Cancel/Back — `type="default"`

### Bad: Switch для смены режима игры (development ↔ game)
### Why: режим затрагивает ВСЕХ пользователей. Одно неверное нажатие — и все теряют доступ.
### Good: `Button` с текстом «Switch to Game Mode» + `modal.confirm` с объяснением

### Bad: Ant Design `Card` для группировки полей формы
### Why: Card приносит лишние стили (padding, border, shadow), которые конфликтуют с дизайном.
### Good: простой `<div>` с CSS-классом

### Bad: `react-window` для виртуализации
### Why: несовместим с текущей версией React/Ant Design.
### Good: нативный скролл или pagination для больших списков

### Bad: `Input.TextArea` через ref
### Why: Ant Design ref API нестабилен для TextArea.
### Good: контролируемое состояние через `useState`

---

## Стили

### Bad: хардкод цвета: `color: #333`, `background: #1a1a1a`
### Why: при смене темы или тюнинге дизайна нужно править сотни мест.
### Good: `var(--text-primary)`, `var(--bg-surface)`, `var(--border)`

### Bad: компонент без `@media (max-width: 767px)`
### Why: на мобилке контент вылезает за экран, кнопки не нажимаются, таблицы не скроллятся.
### Good: каждый UI-компонент сразу с CSS-модулем + `@media` блоком

### Bad: эмодзи в интерфейсе
### Why: выглядят по-разному на разных ОС, неконсистентно с дизайном Ant Design.
### Good: `<Icon component={...} />` из `@ant-design/icons`

---

## i18n

### Bad: хардкод текста: `title="Delete"` или `placeholder="Search..."`
### Why: нельзя переключить язык, текст разбросан по коду.
### Good: `t("admin.delete")` — все строки в `src/shared/config/i18n/locales/{ru,en}.json`

### Bad: JSON-локаль без trailing comma
### Why: добавление новой строки создаёт diff на две строки вместо одной.
### Good: запятая после каждого ключа, кроме последнего в секции

---

## Адаптивность

### Bad: игнорировать мобильную версию при создании компонента
### Why: приходится возвращаться и переделывать. На мобилке сайдбар — drawer, таб-бар скрыт, кнопки ≥32px.
### Good: сразу добавить `@media (max-width: 767px)` блок, проверить оба режима

---

## Builder Agent

### Bad: `await runBuilderAgent()` в server action
### Why: ответ AI идёт до 2 минут → HTTP-запрос висит и отваливается по таймауту.
### Good: server action сохраняет сообщение → `runBuilderAgent()` без await → ответ через SSE (`/api/builder/steps`)

### Bad: отправлять сообщение без подключения к SSE
### Why: клиент не получит прогресс шагов и ответ.
### Good: SSE подключается при заходе на страницу, не только при отправке

### Bad: сохранять чанки файла в отдельные записи БД
### Why: множественная запись чанков = SQLite single-writer lock на каждую запись → блокирует все остальные запросы (страницы, server actions, SSE). Плюс сложная логика восстановления позиции.
### Good: `UploadedFile.text` — полный текст одной записью. Чанки через `text.slice(offset, limit)` на чтении. Прогресс — `lastReadOffset`.

### Bad: 10+ параллельных `generateText()` без контроля concurrency
### Why: забивает event loop, память, SQLite. Next.js начинает лагать на обычных запросах.
### Good: `better-queue` с `concurrent: 3`. Персистентная очередь через `BuilderJob` table, восстановление при рестарте.

### Bad: полагаться что React Query сам синхронизирует мутации между клиентами
### Why: React Query cache — per-browser. `invalidateQueries` на админе A не влияет на админа B.
### Good: SSE-push через `broadcastGameEvent` + `shell.tsx` обработчик. Пример: `builder_message_deleted` → `invalidateQueries` у всех подключённых.

---

## UI / Страницы

### Bad: каждая страница со своим inline-стилем заголовка (`<h2 style={{ fontSize: 16 }}>`)
### Why: дизайн расходится (разные font-size, padding, border). Мобильная кнопка меню дублируется или отсутствует. Изменение требует правок во всех страницах.
### Good: `<PageHeader title="..." actions={...} />` из `src/shared/ui/page-header.tsx`. Единый компонент с мобильной кнопкой меню.

### Bad: мобильная кнопка меню отдельным рядом над контентом (`mobileTopBar`)
### Why: кнопка и заголовок на разных строках — лишний visual weight, трата вертикального места.
### Good: кнопка внутри `PageHeader` на одной строке с заголовком через `MobileMenuProvider` контекст.

### Bad: antd Tabs с overflow-кнопкой «...» на мобилке
### Why: кнопка занимает место справа, создаёт эффект «не доскроллить до конца», визуальный баг.
### Good: `ant-tabs-nav-operations { display: none }`, `ant-tabs-nav-list { overflow-x: auto; transform: none }` — нативный скролл табов.

### Bad: дублировать один и тот же навигационный пункт в разных секциях сайдбара
### Why: путаница, два пути на одну страницу.
### Good: один пункт в правильной секции. AI Settings — только в AdminSection, не в ChatNav.

---

## Git

### Bad: коммитить без явной просьбы пользователя
### Why: пользователь управляет git-историей. Агент не знает когда правильный момент для коммита.
### Good: ждать команды «закоммить» или «сделай коммит»

### Bad: добавлять правила в документацию без подтверждения
### Why: правила проекта определяет пользователь. Агент может предложить, но не вносить.
### Good: предложить в чате → дождаться подтверждения → добавить

---

## Real-time / SSE

### Bad: `setTimeout(poll, 300)` для опроса буфера в SSE-роуте
### Why: создаёт задержку 0-300ms между записью события и доставкой клиенту. Отправитель и получатели видят события в разное время — десинхронизация. Event loop может быть занят (загрузка файла) и poll откладывается ещё дальше.
### Good: EventEmitter + подписка (`onStep`/`onGameEvent`). Источник пушит событие → подписчики получают мгновенно в той же итерации event loop. См. `step-tracker.ts` (EventEmitter) и `steps/route.ts` (подписка через `onStep`).

### Bad: `eventSource.close()` в `onerror` обработчике
### Why: EventSource рассчитан на авто-реконнект. Закрытие в onerror убивает реконнект → клиент теряет все будущие события до перезагрузки страницы.
### Good: оставить `onerror` пустым — EventSource сам переподключится.

### Bad: `refetchInterval: 3000` в React Query как замена SSE
### Why: создаёт лишние запросы к серверу (4 запроса каждые 3 секунды на двух клиентах). SSE должен быть единственным механизмом real-time обновлений.
### Good: только SSE + `invalidateQueries`. При начальной загрузке — mount refetch. См. `useBuilderMessages.ts`, `useFileProgress.ts`.

### Bad: `throwIfCancelled()` с `DOMException("AbortError")` внутри tool.execute
### Why: AI SDK ловит ошибки тулзов как tool results и отдаёт LLM, а не пробрасывает в `generateText()`. AbortError внутри тулза никогда не прерывает генерацию — LLM видит ошибку и ретраит тулз.
### Good: `if (isCancelled()) throw new Error("errors.cancelled")` — обычная ошибка, AI SDK отдаёт LLM. Между шагами `abortSignal` проверяется и корректно прерывает `generateText()`.

---

## LLM / Prompts

### Bad: агент утверждает что создал документы без проверки через тулз
### Why: LLM галлюцинирует выполненную работу. Без `search_documents()` проверки факта создания — агент пишет "сделал 7 brain-документов" когда их 0 в БД.
### Good: после выхода из STUDY MODE обязательный `search_documents(category="brain")` перед отчётом. Никогда не утверждать что документы созданы без проверки тулзом. См. `builder-system.md:Study Mode:Step 5`.

### Bad: промпт говорит "Create brain documents IF the chunk contains instructions"
### Why: LLM интерпретирует "if" буквально — чанк с правилами не "instructions" → пропускает мозги. За весь файл ни одного brain-документа.
### Good: перечислить конкретные brain-типы как обязательный чеклист на каждом чанке: `mechanics`, `char_creation`, `routing`, и т.д. См. `builder-system.md:Study Mode:Step 3b`.

### Bad: `prisma.x.update().catch()` без `await` + `broadcastGameEvent` следом
### Why: DB-update ещё не завершён, а broadcast уже ушёл. Клиент рефетчит и видит старые данные. Бабл показывает прогресс, а нижняя панель — нет.
### Good: `await prisma.x.update(...).catch(() => {})` перед broadcast. См. G27.

### Bad: `prompt += "Create or update documents for EVERY rule"` — рекомендательный тон
### Why: LLM воспринимает как совет, не требование. Пропускает чанки без документирования.
### Good: `MANDATORY: Document this chunk before moving on. BLOCKING RULE: Never advance without create_document/update_document.` См. `builder-system.md`.
