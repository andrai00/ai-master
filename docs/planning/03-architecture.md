# Архитектурные принципы

## Ключевое решение: платформа не знает правил игры

Платформа **ничего** не знает про HP, ходы, раунды, инициативу, классы, расы, заклинания, бой, социальные конфликты. Всё это — зона нейронки через данные.

Мы делаем универсальные примитивы. Нейронка решает логику.

---

## Граница: что пишем мы, что решает нейронка

### Мы (код-платформа)

| Примитив | Зачем |
|---|---|
| Prisma + SQLite | Все данные: пользователи, мастера, документы, чаты, логи, изображения |
| Рендерер Markdown + composite-документы | Отображение, сборка слоёв |
| Движок формул (детерминированный) | Вычисления вместо математики нейронкой |
| Чат: общий + личный | Общение, маршрутизация нейронкой |
| Инструменты для агентов | read, write, search, semantic_search, etc. |
| Drag-n-drop, кнопки бросков, слоты | Интерактивность |
| Next.js + Ant Design | Интерфейс, i18n, темы |
| Экспорт/импорт дампов мастеров | Шеринг готовых конфигураций |

### Нейронка (логика)

- Структура правил и документов
- Секции, поля и формулы листов (всех типов)
- Формат и смысл метаданных — какие поля нужны под конкретную игру
- Игровая логика (проверки, сцены, бой, скрытые действия)
- Связи между документами
- Какие данные загружать в контекст в данный момент
- Какие файлы публичные, какие скрытые

---

## Схема БД (Prisma + SQLite)

> **Правило миграций:** `prisma migrate reset` **ЗАПРЕЩЁН** — он дропает всю базу.  
> При drift (расхождение БД с историей миграций) использовать `prisma db push` — синхронизирует схему без потери данных.  
> Нормальный workflow: `schema.prisma → migrate dev → generate`.

### Users
```prisma
model User {
  id           String       @id
  login        String       @unique
  passwordHash String
  role         String       @default("player") // "admin" | "player"
  displayName  String       @default("")
  avatar       String       @default("")
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @default(now()) @updatedAt
  ownedMasters Master[]     @relation("MasterOwner")
  gameAccess   GameAccess[]
  messages     Message[]
  sessions     Session[]    @relation("SessionPlayer")
}
```

### Masters (игры)
```prisma
model Master {
  id          String       @id @default(uuid())
  ownerId     String
  name        String
  description String?
  mode        String       @default("development") // "development" | "game"
  createdAt   DateTime     @default(now())
  owner       User         @relation("MasterOwner", fields: [ownerId], references: [id])
  access      GameAccess[]
  activeGame  ActiveGame[]
  sessions    Session[]
  documents   Document[]
  uploadedFiles UploadedFile[]
}
```

**Режимы мастера:**
- `development` — Builder работает с админом, правила редактируются. Игроки не подключены.
- `game` — Game Master ведёт игру. Глоссарий и мозг read-only. Игровые данные пишутся.

Переключение между режимами — только админом.

### ActiveGame (текущая игра и режим — одна запись на сервер)

```prisma
model ActiveGame {
  id              String @id @default("singleton")
  currentMasterId String
  master          Master @relation(fields: [currentMasterId], references: [id], onDelete: Cascade)
}
```

Одна строка, `id = "singleton"`. Содержит два факта о текущем состоянии:
- Какая игра активна (`currentMasterId`)
- Режим активной игры — берётся из `Master.mode` (у каждой игры свой последний режим)

Меняет **только админ-владелец** через server actions:
- `switchGameAction(masterId)` → `UPDATE ActiveGame SET currentMasterId = ?`
- `setMasterMode(masterId, mode)` → `UPDATE Master SET mode = ? WHERE id = ?`

При переключении игры/режима — **SSE-push** всем подключённым клиентам, чтобы интерфейс обновился мгновенно.

Зачем `mode` на `Master` а не на `ActiveGame`:
- У каждой игры свой последний режим — при переключении между играми режим не сбрасывается
- `ActiveGame` — только указатель «что сейчас активно», а не хранилище состояния игры

### Каскадное удаление игры

При удалении игры (`Master`) через `deleteGameAction` все связанные данные удаляются автоматически через `onDelete: Cascade`:

| Модель | Что удаляется |
|---|---|
| `GameAccess` | Права доступа игроков к этой игре |
| `ActiveGame` | Запись текущей игры (если была активна) |
| `Session` | Все сессии: игровая, личные, билдера |
| `Message` | Все сообщения внутри сессий (каскад через Session) |
| `Document` | Все документы: глоссарий, мозг, скрытые/видимые |
| `UploadedFile` | Распарсенные загруженные файлы с прогрессом чтения |
**Пользователи не затрагиваются** — `User` и его данные (пароль, аватар, и т.д.) остаются нетронутыми.

**Если удаляется текущая активная игра:** `ActiveGame` каскадно удаляется вместе с `Master`. При следующем обращении `getActiveGame()` создаст нового синглтона, указав на первую доступную игру. Всем подключённым клиентам через SSE отправляется событие `game_deleted` — клиенты сбрасывают кэш и перезагружают интерфейс.

### GameAccess (доступ игроков к играм)
```prisma
model GameAccess {
  id        String   @id @default(uuid())
  userId    String
  masterId  String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  master    Master   @relation(fields: [masterId], references: [id], onDelete: Cascade)

  @@unique([userId, masterId])
}
```

**Правила доступа:**
- Админ-владелец (`master.ownerId`) всегда имеет доступ ко всем своим играм
- Игроки только через `GameAccess` (назначает админ)
- Игрок без доступа к текущей игре — редирект на страницу без доступа
- После изменения доступов админом — проверка активных сессий

### Documents (правила, листы, шаблоны, etc.)
```prisma
model Document {
  id          String   @id @default(uuid())
  masterId    String
  title       String
  type        String   // rule, character_sheet, template, scene, note, loot
  category    String   @default("glossary") // glossary | brain | game_hidden | game_visible
  visibility  String   @default("public")   // public | private | hidden
  playerId    String?  // для game_visible: какому игроку принадлежит (null = общий)
  tags        String   @default("[]")       // JSON array: ["бой", "инициатива"]
  section     String?  // секция в сайдбаре
  order       Int      @default(0)
  summary     String?  // 1-2 предложения для агента
  content     String   // тело .md
  status      String   @default("active")   // draft | active | archived
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  master      Master   @relation(fields: [masterId], references: [id], onDelete: Cascade)
}
```

**Категории документов (`category`):**

| Категория | Кто пишет | Когда | Кто читает | Read-only в game mode |
|---|---|---|---|---|
| `glossary` | Builder | Режим разработки | Builder, Game Master | Да |
| `brain` | Builder | Режим разработки | Game Master | Да |
| `game_hidden` | Game Master | Режим игры | Game Master, админ | Нет (только в игре) |
| `game_visible` | Game Master | Режим игры (+ миграции) | Назначенный игрок, Game Master, админ | Нет (только в игре) |

**Инварианты:**
- В режиме `game` нельзя писать/менять документы с category=`glossary` или `brain`
- В режиме `development` Builder может менять `glossary` и `brain`, но не трогает `game_hidden` и `game_visible`
- `game_visible` с `playerId` — видит только этот игрок (и админ/Game Master)
- `game_visible` без `playerId` — общий документ (видят все игроки)
- Игроки не могут писать документы напрямую — только через Game Master (чат)

**Сводка изменений (миграции):**
При переключении из `development` в `game`, Builder создаёт специальный документ с category=`brain` и type=`migration_summary`, где описывает что изменилось. Game Master при старте игровой сессии читает этот документ и решает, нужно ли обновить `game_visible`/`game_hidden` документы.

### Перекрёстные ссылки между документами

Документы могут ссылаться друг на друга через Markdown-ссылки вида `[[document-id]]` или `[[document-id#heading]]`. Рендерер на клиенте превращает их в кликабельные ссылки, открывающие целевой документ. Нейронка использует их для навигации между связанными документами.

**Кто создаёт ссылки:**

| Категория | Кто расставляет ссылки |
|---|---|
| `glossary` | Builder при парсинге: ссылки между связанными правилами |
| `brain` | Builder: ссылки из инструкций на конкретные правила глоссария |
| `game_hidden` | Game Master: ссылки на правила, заметки, листы персонажей |
| `game_visible` | Game Master: ссылки на общедоступные правила и другую видимую информацию |

**Правила безопасности ссылок из `game_visible`:**

Игроки не должны получить доступ к скрытой информации через ссылки. Поэтому действуют жёсткие ограничения на то, куда могут вести ссылки из документов, видимых игрокам:

| Цель ссылки | Разрешено в `game_visible`? | Пояснение |
|---|---|---|
| `glossary` | ✅ Да | Правила игры — игроки могут и должны их видеть |
| `glossary#heading` | ✅ Да | Ссылка на конкретный раздел правила — идеальный случай |
| `brain` | ❌ **Запрещено** | Инструкции ИИ для самого себя — игроки не должны их видеть |
| `game_hidden` | ❌ **Запрещено** | Скрытые планы, идеи, история — компрометирует игру |
| `game_visible` (общий) | ✅ Да | Ссылка на другой общий документ |
| `game_visible` (чужой playerId) | ❌ **Запрещено** | Нельзя ссылаться на лист другого игрока |
| `game_visible` (свой playerId) | ✅ Да | Ссылка на свой же лист — нормально |

**Обратные ссылки (из скрытых в видимые) — всегда разрешены:**
- `game_hidden` → `game_visible`: ✅ (Game Master ссылается на лист персонажа в своих заметках)
- `brain` → `glossary`: ✅ (инструкции ИИ ссылаются на конкретные правила)

**Где проверяется:**
- **На этапе записи (Server Action):** Game Master при создании/обновлении `game_visible` документа. Если в контенте обнаружена ссылка на `brain`, `game_hidden`, или чужой `game_visible` — операция отклоняется.
- **На этапе рендеринга (UI):** клиентский рендерер НЕ рендерит ссылки на документы, к которым у игрока нет доступа — отображает как обычный текст.

**Важно для нейронки:** Game Master должен понимать эти ограничения (описаны в system prompt) и не вставлять запрещённые ссылки в `game_visible` документы. Платформа проверяет на уровне кода как защитный слой.

### Sessions (чаты)

```prisma
model Session {
  id          String    @id @default(uuid())
  masterId    String
  type        String    // "game" | "personal" | "builder"
  playerId    String?   // для personal: чей личный чат (у каждого игрока + админа свой)
  name        String
  builderMode String    @default("brain") // "brain" | "memory" (только для builder-сессий)
  createdAt   DateTime  @default(now())
  master      Master    @relation(fields: [masterId], references: [id], onDelete: Cascade)
  player      User?     @relation("SessionPlayer", fields: [playerId], references: [id])
  messages    Message[]
}
```

**Три типа чатов:**

| Тип | Сессий | Скоуп | Кто видит | Характер |
|---|---|---|---|---|
| `game` | 1 на мастера | `masterId` | Все игроки + админы | Книга — сквозная история RPG-событий |
| `personal` | 1 на игрока | `masterId + playerId` | Игрок + все админы | Приватные вопросы, создание персонажа, споры |
| `builder` | 1 на мастера | `masterId` | Все админы | Агентный чат настройки правил |

- При переключении игры — полностью другой набор сессий
- `game`-сессия создаётся вместе с мастером
- `personal`-сессия создаётся при первом личном сообщении игрока
- `builder`-сессия создаётся при первом входе админа в чат настройки

### Messages (сообщения)

```prisma
model Message {
  id         String   @id @default(uuid())
  sessionId  String
  senderId   String
  role       String   // "admin" | "player" | "master" | "builder"
  content    String
  shared     Boolean  @default(false)   // сообщение-событие "поделился из личного"
  createdAt  DateTime @default(now())
  session    Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  sender     User     @relation(fields: [senderId], references: [id])
}
```

`role` определяет отображение (аватар, сторона пузыря) и права на чтение.
`shared` — флаг для сообщений-событий "игрок поделился из личного чата".
Такие сообщения **не попадают в историю и саммари** — они только для UI в реальном времени.

---

## Память чатов и автосаммаризация

### Как работает

Все три типа чатов — сквозные, без ветвления истории. Нет кнопок «создать новый чат» в UI. Но есть механика памяти чтобы контекстное окно AI не перегружалось.

**Принцип: AI сам управляет своей памятью.** Когда история чата переваливает за ~20 сообщений, AI пишет саммари в документ `game_hidden` (для game/personal) или `brain` (для builder). При следующем запросе старые сообщения заменяются на саммари, свежие остаются сырыми.

### Контекст AI при запросе

```
┌────────────────────────────────────┐
│ САММАРИ (сообщения 1..N-10)       │  ← сжато в 2-3 предложения,
│ «Обсудили расы, решили что...»     │     хранится в game_hidden/brain
├────────────────────────────────────┤
│ [N-9] админ: ...                   │
│ [N-8] builder: ...                 │  ← последние 10 сообщений,
│ ...                                │     сырые, как есть
│ [N] админ: новый запрос            │
└────────────────────────────────────┘
```

### По типам чатов

| Чат | Где саммари | Кто пишет | Когда |
|---|---|---|---|
| Game | `game_hidden` | Game Master | Каждые ~20 сообщений, скрыто от игроков |
| Personal | `game_hidden` | Game Master | Каждые ~20 сообщений |
| Builder | `brain` / `game_hidden` | Builder | Каждые ~20 сообщений |

### Инструменты памяти для AI

- `write_note(title, content)` — записать заметку-память
- `read_note(id)` — прочитать заметку
- `search_notes(query)` — поиск по заметкам
- `search_history(query)` — поиск по полной истории чата (fallback, медленнее)

### Просмотр истории (UI)

При прокрутке чата вверх — кнопка «Показать всю историю». Открывает paginated view без поля ввода. Сообщения-события (`shared=true`) в историю не попадают. Броски кубов (в будущем) — попадают как результат, но не как предложение броска.

---

## Текущая игра и режим

### Одна игра на всех

`ActiveGame` — одна запись на весь сервер. Какую игру выбрал админ — ту видят все. Никакой индивидуальности: нет «у каждого своя текущая игра», нет `currentMasterId` в JWT. Переключил админ — переключилось у всех.

### Переключение игры

1. Админ вызывает `switchGameAction(masterId)` (из модалки выбора игры в шапке сайдбара)
2. Server action: `UPDATE ActiveGame SET currentMasterId = ?`
3. **SSE-push** события `game_switch` всем подключённым клиентам
4. Клиенты: перезагружают контекст (сайдбар, чаты, документы) под новую игру

### Переключение режима

1. Админ вызывает `setMasterMode(masterId, mode)` 
2. Server action: `UPDATE Master SET mode = ? WHERE id = ?`
3. **SSE-push** события `mode_switch` всем подключённым клиентам
4. Клиенты: обновляют UI (режим разработки vs игры)

### Проверка доступа

При каждом запросе:
1. Читаем `ActiveGame` → получаем `currentMasterId`
2. Проверяем что пользователь имеет доступ: админ-владелец или запись в `GameAccess`
3. Если нет доступа — редирект на страницу «Нет доступа»

### Последствия изменения доступов

Когда админ убирает игрока из `GameAccess`:
- Игрок теряет доступ мгновенно (проверка при следующем запросе)
- **SSE-push** события `kick` этому игроку → `EventSource` закрывается → редирект на `/login`
- Существующая реализация: `src/app/api/game-events/route.ts`

### Данные изолированы по играм

**Каждая игра имеет своё:**
| Данные | Категория | Где хранятся |
|---|---|---|
| Глоссарий (исходные правила) | `glossary` | `Document` (masterId) |
| Мозг (инструкции ИИ) | `brain` | `Document` (masterId) |
| Сводки миграций | `brain` (type=migration_summary) | `Document` (masterId) |
| Шаблоны листов | `brain` (type=template) | `Document` (masterId) |
| Скрытые заметки мастера | `game_hidden` | `Document` (masterId) |
| Листы персонажей | `game_visible` | `Document` (masterId, playerId) |
| Общие игровые данные | `game_visible` | `Document` (masterId, playerId=null) |
| Сессии | — | `Session` (masterId) |
| Чат и сообщения | — | `Message` → `Session` → `Master` |
| Логи | `game_hidden` (type=log) | `Document` (masterId) |

**Дампы мастеров (export/import):** выгружается вся игра целиком — документы,
настройки, шаблоны. БЕЗ данных игроков, сообщений и логов конкретных сессий.
Загрузка дампа создаёт НОВУЮ игру с идентичной структурой правил.

---

## Метаданные документов

Front-matter YAML больше не нужен. Вся метаинформация — колонки таблицы `Document`:
- `type`, `category`, `visibility`, `tags`, `section`, `order` — для построения сайдбара и фильтрации
- `playerId` — привязка к игроку для `game_visible` документов (null = общий)
- `summary` — первое что читает агент перед открытием тела
- `content` — тело Markdown
- `tags` — JSON-массив, гибкая группировка (нейронка сама решает какие теги)

Сайдбар строится одним запросом:
```sql
SELECT title, type, category, section, tags, `order`
FROM Document
WHERE masterId = ? AND visibility != 'hidden'
  AND (category = 'game_visible' OR category = 'glossary')
ORDER BY section, `order`
```

---

## Дампы мастеров (экспорт/импорт)

Админ может выгрузить полную конфигурацию мастера как дамп (мозг ИИ-мастера):
- Все документы (правила, шаблоны, скилы)
- Настройки и формулы
- БЕЗ данных игроков, сессий и чатов

Формат: SQLite-файл или JSON-архив. Загрузка дампа создаёт
нового мастера с идентичной структурой правил.

Использование: шеринг готовых конфигураций между админами,
резервное копирование, тестирование на чужих правилах.

Память сессии (summary, логи) — отдельно от мозга мастера.
Мозг = правила и структура. Память = текущее состояние игры.

---

## Три слоя в документе (composite-документы)

Один лист персонажа собирается из слоёв:

### Слой 1: Тело .md (видимое игроку)
```md
# Гаррет
**HP:** 38 / 45
**Оружие:** Короткий меч (1d6 piercing)
```
Рендерер подставляет данные из слоёв 2 и 3. Игрок видит только это.

### Слой 2: Данные (скрытое)
Скалярные значения и сложные структуры в отдельных таблицах или
JSON-колонках. Игроку не показываются. Рендерер читает для подстановки.

### Слой 3: Композиция (сборка)
Список слоёв с приоритетами. Позволяет накладывать эффекты,
добавлять секции, не переписывая весь лист:
```json
[
  { "layer": "race_elf", "priority": 1 },
  { "layer": "class_rogue", "priority": 2 },
  { "layer": "bless_effect", "priority": 10, "duration": 3 }
]
```

---

## Движок формул (принцип)

- Нейронка задаёт формулы, нейронка указывает какие данные подставить
- Вычисляет код детерминированно
- Формулы хранятся как данные, могут меняться
- Поддерживают: переменные, ссылки на поля, броски кубов, условия
- Автоматический пересчёт зависимостей

---

## Итоговый список того что мы пишем кодом

1. Prisma + SQLite: схема (включая `ActiveGame`), миграции, CRUD
2. Рендерер Markdown: скрытые маркеры, composite-сборка, подстановка данных, разрешение перекрёстных ссылок `[[doc-id]]` с проверкой доступа
3. Чат: общий/личный, стриминг (SSE), кнопки действий (copy/share)
4. Drag-n-drop: слоты инвентаря/экипировки
5. Движок формул: парсинг, вычисление, граф зависимостей
6. Инструменты для агентов: read, write, search, semantic_search, send_chat
7. Next.js: серверные экшены, SSR, i18n, темы, адаптив
8. Экспорт/импорт дампов мастеров
9. SSE-подсистема: game-events (mode_switch, kick, builder_mode_change, game_deleted) — push всем клиентам
10. ActiveGame + switchGame / setMasterMode: глобальное состояние игры и режима

Всё остальное — зона нейронки.
