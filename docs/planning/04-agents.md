# Внутреннее устройство агентов

> **Актуально:** Builder-агент реализован через Vercel AI SDK v7 + Prisma + SQLite. Game Master — заглушка, будет по той же схеме.

## Архитектура отправки и получения

**Ключевой принцип:** отправка сообщения и получение ответа AI разделены.

```
Клиент → sendBuilderMessageAction() → сохраняет сообщение в БД → return { success: true }
                                                                    ↓
                                         runBuilderAgent() в фоне (без await)
                                                                    ↓
                                         SSE-события → все клиенты получают одинаково
```

- Server Action **не ждёт** AI. Сохранил сообщение — сразу ответил.
- AI работает в фоне, прогресс и результат — через SSE.
- Даже отправитель видит ответ AI из SSE, не из Server Action.

## SSE-протокол (Builder Chat)

События отправляются через `/api/stream` (step-события):

| Тип | Данные | Что делает клиент |
|---|---|---|
| `started` | — | Показать бабл обдумывания |
| `step` | `{ tool, detail }` | Обновить текст в бабле («Изучает файл (5/32)») |
| `stopping` | — | Бабл «Stopping...» |
| `done` | — | Скрыть бабл, инвалидировать кэш сообщений |
| `stopped` | — | Скрыть бабл |
| `error` | `{ message }` | `notification.error`, скрыть бабл |

Клиент подключается к SSE **при заходе на страницу** (не только при отправке). Все админы видят обработку.

## Агентный цикл

Два прохода Plan → Execute:

```
Pass 1 (план): generateText({ tools: getPlanTools(), system: planSystem, stopWhen: isStepCount(20) })
  → read-only тулы, короткий план-промт (~1K токенов вместо ~8K), план STUDY|RECORD|ROLLS|REPLY
Pass 2 (выполнение): generateText({ tools: getTools(), system: system (полный), stopWhen: isStepCount(100) })
  → полные тулы, полный промт, финальный ответ через result.text
```

- Мозг прелоажен в промт (`## Brain (preloaded)` — index + секции), `get_brain(topic)` — только полная секция
- Гейт «пустой вызов»: нет новых сообщений/бросков → один короткий read-only вызов «спроси игрока»
- `abortSignal` — прерывание по Stop
- `prepareStep` — сжатие контекста (см. ниже)
- Ретрай пустого ответа — только в Pass 2, затем fallback
- Лимиты шагов: Pass 1 = 20, Pass 2 = 100 (builder STUDY — без лимита, `isLoopFinished()`)
- Диагностика: при `AGENT_TRACE=1` пишется `TraceEvent` (каждый промт, тул-вызов, ответ)

---

## Разделение по режимам

### Режимы мастера (Master.mode)

| | Development mode | Game mode |
|---|---|---|
| Активный агент | Builder | Game Master |
| Кто может работать | Только админ | Админ + игроки |
| `glossary` (глоссарий) | Чтение + запись | Только чтение |
| `brain` (мозг/правила ИИ) | Чтение + запись | Только чтение |
| `game_hidden` (скрытые данные) | Недоступны | Чтение + запись |
| `game_visible` (данные игроков) | Недоступны | Чтение + запись |

### Режимы Builder внутри development mode (Session.builderMode)

Внутри development mode Builder работает в одном из двух под-режимов:

| | Brain mode (по умолчанию) | Memory mode |
|---|---|---|
| `glossary` | Чтение + запись | Только чтение |
| `brain` | Чтение + запись | Только чтение |
| `game_hidden` | Недоступны | Чтение + запись |
| `game_visible` | Недоступны | Чтение + запись |

- **Brain mode** — настройка правил и инструкций ИИ-мастера
- **Memory mode** — ручная работа с игровым состоянием: правка листов персонажей, скрытых заметок, миграции после изменений правил
- Переключение через свитчер в строке ввода Builder-чата с подтверждением через `modal.confirm`
- При переключении в Memory после >30 мин простоя — дополнительное предупреждение
- Событие `builder_mode_change` транслируется всем клиентам через SSE

Переключение режима мастера (development/game) — только админ. При переходе dev→game Builder создаёт migration summary. Game Master читает его при старте.

---

## Инструменты Builder (Tools)

Вызываются моделью через AI SDK. Каждый инструмент проверяет `builderMode` сессии и ограничивает scope. Описания инструментов хранятся в `src/shared/config/prompts/tool-descriptions.ts`.

| Инструмент | Brain mode | Memory mode |
|---|---|---|
| `list_uploaded_files()` | Список файлов | Список файлов |
| `explore_archive()` | дерево + плоский список `folders` (полный путь + кол-во) | — |
| `create_document(title, content, category, type, tags?, summary?)` | `glossary` / `brain` | `game_hidden` / `game_visible` |
| `update_document(id, content, title?, summary?)` | `glossary` / `brain` | `game_hidden` / `game_visible` |
| `delete_document(id)` | `glossary` / `brain` | `game_hidden` / `game_visible` |
| `read_document(id)` | `glossary` / `brain` | все категории |
| `search_rules(query, type?, limit?)` | глоссарий (до 50, +total) | глоссарий (до 50, +total) |
| `glossary_overview()` | карта типов глоссария (тип → кол-во + samples) | карта типов глоссария |
| `get_brain(topic?)` | мозг: индекс + секции (прелоажен в промт) | мозг: индекс + секции |
| `get_gm_notes()` | — | game_hidden (заметки/память) |
| `get_scene_state()` | — | текущая сцена |
| `get_player_sheet(playerId?)` | — | game_visible (листы/записи игроков) |
| `get_players()` | — | состав участников и их вовлечённость |
| `resolve_glossary_link(title)` | глоссарий: title → UUID | глоссарий: title → UUID |
| `bulk_import_to_glossary(typeMap)` | префиксный импорт (longest wins, skipped) | — |
| `scan_wiki_links` / `replace_wiki_links` / `validate_links` | проверка/починка перекрёстных ссылок | — |

**Защита от дубликатов:** `create_document` проверяет существующий документ с тем же title. Если найден — возвращает ID существующего, не создавая новый. Builder может переключиться на `update_document`.

## Контекст Builder при запросе

```
[system prompt]           — из builder-system.md с {builderMode} (brain/memory)
[саммари чата]            — builder_summary документ (brain) если есть
[имя игры + описание]     — из ActiveGame
[имя админа]              — из сессии
[история: ≤20 сообщений]  — только несуммированные сообщения builder-чата
[инструменты]             — 6 tools, mode-aware scope (см. выше)
[запрос админа]           — текущее сообщение (+ fileIds если есть файлы)
```

Суммированные сообщения исключаются из контекста — вместо них подставляется саммари-документ. Пустые сообщения (только файлы, без текста) не суммируются.

### Game Master — Game Chat (game mode)

```
[system prompt]           — ты Game Master, ведёшь игру
[brain (preloaded)]       — мозг прелоажен в промт (index + секции); get_brain(topic) для полной секции
[glossary]                — НЕ весь. glossary_overview (карта типов) + search_rules по необходимости
[память: саммари]         — саммари старых сообщений game-чата (game_hidden)
[история: 30 сообщений]   — ПОСЛЕДНИЕ 30 (desc + take + reverse), новые помечены 🆕
[game_visible игрока]     — лист персонажа текущего игрока
[инструменты]             — update_char_sheet, present_roll_check, get_rolls (только старые), get_chat_summary, ...
[сообщение игрока]        — текущее сообщение
```

### Game Master — Personal Chat (game mode)

```
[system prompt]           — ты Game Master, личный чат
[brain (preloaded)]       — мозг прелоажен в промт (index + секции)
[glossary]                — НЕ весь. glossary_overview + search_rules по необходимости
[память: саммари]         — саммари старых сообщений personal-чата (game_hidden)
[история: 20 сообщений]   — ПОСЛЕДНИЕ 20 (desc + take + reverse), новые помечены 🆕
[game_visible игрока]     — лист персонажа этого игрока
[инструменты]
[сообщение игрока]
```

### Память и автосаммаризация

Все чаты сквозные, без ветвления. AI сам управляет памятью:
- При ~20 сообщениях в истории → пишет саммари (2-3 предложения) в документ
- Саммари + последние 10 сырых сообщений = контекст
- Для детального поиска по истории: `search_history(query)`

Инструменты памяти:
| Инструмент | Назначение |
|---|---|
| `write_note(title, content)` | Записать заметку-память |
| `read_note(id)` | Прочитать заметку |
| `search_notes(query)` | Поиск по заметкам |
| `search_history(query)` | Поиск по полной истории чата (fallback) |
| `summarize_to_state(text)` | Сохранить саммари чата |

---

## Builder: устройство

### Загрузка и парсинг файлов

1. `POST /api/builder/upload` (API Route, не Server Action — файлы >1MB)
2. Принимает multipart/form-data: `.zip` (архив с `.md`) или одиночный `.md`
3. ZIP распаковывается `adm-zip` (синхронно в роуте, ~600мс на 8592 файла), `.md` → `UploadedFile` записи (id, filename, path, text, status: ready)
4. Авто-запуск агента после загрузки УДАЛЁН — билдер запускается только кнопкой «Запросить ответ»
5. Кнопка подхватывает `fileIds` из последнего admin-сообщения и передаёт их в `runBuilderAgent`
6. Агент: `explore_archive()` (дерево + `folders`) → типы по смыслу → `bulk_import_to_glossary(typeMap)` пакетно → `scan_wiki_links`/`replace_wiki_links` → импортированные `UploadedFile` удаляются

### Остановка (Stop)

Три слоя прерывания:

1. **`cancelAll()`** — глобальный флаг, все 6 тулов проверяют через `throwIfCancelled()`
2. **`stopProcessing(sessionId)`** — `ac.abort()` на AbortController, прерывает HTTP-запросы модели
3. **`parse-cancel.ts`** — флаг для `read_parsed_file` в цикле ожидания парсинга

Реагирует в течение 100ms (период проверки в polling-цикле).

### Ретраи

`generateText` обёрнут в цикл до 5 попыток. Экспоненциальный backoff: 1с, 2с, 4с, 8с.  
Ретраятся только transient-ошибки (сеть, формат ответа). НЕ ретраятся: AbortError, ошибки конфигурации.

### Сжатие контекста (prepareStep)

`prepareStep` вызывается AI SDK перед каждым шагом. Общий модуль `src/shared/lib/agents/context-compress.ts` (`compressMessages`) — используется билдером и GM:

1. Считает `все_сообщения.length / 4 ≈ токены`
2. Сравнивает с `contextLimit × 0.7` (настраивается в AI Settings, авто-дефолт по провайдеру)
3. При превышении — сжимает: system + последнее сообщение админа + **последний tool-шаг** + саммари всех остальных:

```
[Compressed — previous steps]
Created 12 documents. Updated 3 documents. Searched 5 times.
```

4. Модель получает ~4 сообщения вместо 50+. Текущий tool-шаг не сжимается.

### Файлы

| Файл | Назначение |
|---|---|
| `builder-runner.ts` | Главный раннер: контекст, Plan→Execute, retry, prepareStep |
| `gm-runner.ts` | Раннер Game Master: game + personal, Plan→Execute, трейс |
| `context-compress.ts` | Общий модуль сжатия контекста (builder + GM) |
| `trace.ts` | Диагностика: `TraceEvent` (промты, тулы, ответы) при `AGENT_TRACE=1` |
| `step-tracker.ts` | Хранилище SSE-событий (in-memory, globalThis) |
| `parse-cancel.ts` | Глобальный флаг отмены для всех тулов |
| `archive-parser.ts` / `upload/route.ts` | Распаковка zip + загрузка |
| `tools/*.tool.ts` | 6 инструментов для AI SDK |
| `builder-system.md` | System prompt Builder'а |
| `send-message.ts` | Server Action: сохраняет сообщение, запускает фон |
| `stop-builder.ts` | Server Action: cancelAll + stopProcessing |
| `/api/builder/upload/route.ts` | API Route: приём и парсинг файлов |
| `/api/stream/route.ts` | SSE endpoint: события обработки |

---

### Правила поведения

1. Не выдумывать. Нет в правилах — спросить админа.
2. Сохранять ссылку на источник для каждого утверждения.
3. Если информации недостаточно — вопрос с вариантами + свой ответ.
4. После важного этапа показать админу итог и ждать подтверждения.
5. Всё что создал — должно быть пригодно для поиска (чёткие названия, summary, ключевые слова).
6. **При доработке:** создать migration summary со списком изменений. Не трогать игровые данные.

---

## Агент 2: Game Master

### System prompt

```
Ты — ИИ-мастер настольной ролевой игры.
Ты ведёшь игру для игроков используя правила и структуру
которые подготовил Builder.

Ты работаешь в режиме игры.

Ты не оцениваешь правила, ты им следуешь.
Работаешь с несколькими чатами: личные с каждым игроком
и один общий. Уважай приватность личных чатов.

Твоя задача — увлекательный опыт в рамках правил.

Данные с которыми ты работаешь:
- glossary (глоссарий) — исходные правила, read-only. Не менять.
- brain (мозг) — инструкции от Builder'а: как вести игру,
  порядок создания персонажа, когда что использовать. Read-only.
- game_hidden — твои скрытые заметки, планы, идеи. Только ты
  и админ (для отладки). Игроки не видят.
- game_visible — данные игроков (листы, инвентарь, общая информация).
  Каждый игрок видит только свои (playerId). Общие (playerId=null)
  видят все.

При переключении из режима разработки в режим игры:
- Прочитай migration summary от Builder'а
- Реши, нужно ли обновить game_visible/game_hidden документы
- Если нужно — обнови через инструменты

Никогда не меняй glossary и brain. Это зона Builder'а.
```

### Специфичные инструменты (Game Master)

| Инструмент | Описание |
|---|---|
| `search_rules(query, type?, limit?)` | Поиск по глоссарию (тип-фильтр, total). Только по необходимости |
| `glossary_overview()` | Карта типов глоссария (тип → кол-во + samples), один вызов |
| `get_brain(topic?)` | Мозг (прелоажен в промт; для полной секции) |
| `get_gm_notes()` | Список скрытых заметок (game_hidden) |
| `get_scene_state()` / `set_scene_state(data)` | Текущая сцена / изменить (game_hidden) |
| `get_player_sheet(playerId)` | Лист персонажа (game_visible) |
| `update_char_sheet(playerId, changes)` | Изменить данные листа |
| `read_document(id)` / `create_document` / `update_document` / `delete_document` | Документы по доменам |
| `write_note(title, content)` | Записать скрытую заметку (game_hidden) |
| `roll_dice(expression)` | Бросок кубов (мастер) |
| `present_roll_check(checkName, diceExpression, count?)` | Предложить игроку кнопку броска |
| `get_rolls(filter?)` | Броски сессии — ТОЛЬКО для старых/спорных (завершённые уже в контексте) |
| `remove_roll` / `confirm_rolls` | Отменить назначенный / подтвердить завершённый |
| `get_chat_summary()` / `update_chat_summary(content)` | Саммари чата |
| `get_players()` | Состав игроков и вовлечённость |
| `resolve_glossary_link(title)` | Глоссарий: title → UUID |

Каждый read-тул помечает результат полем `source` (glossary/game_visible/game_hidden/brain/rolls/players/chat_summary) — модель учитывает, что можно говорить игрокам.

### Skills (часть общие, часть игро-специфичные)

**Общие (для любой игры):**

| Скил | Когда грузить | Что внутри |
|---|---|---|
| `scene-narration` | Описание сцены | Как описывать, сколько деталей, когда остановиться |
| `hidden-action` | Скрытное действие | Как обработать не раскрывая другим |
| `handle-migration` | После переключения dev→game | Как прочитать migration summary, оценить влияние, решить что обновить |

**Игро-специфичные (создаёт Builder под игру):**

| Скил | Когда грузить | Что внутри |
|---|---|---|
| `character-creation` | Создание персонажа | Процесс (шаги зависят от игры) |
| `combat-resolution` | Бой | Очерёдность, проверки, урон (если бой есть в игре) |
| `skill-check` | Проверка | Какая хар-ка, бросок, сложность |
| `inventory-management` | Предметы | Добавить, убрать, переместить, экипировать |
| `level-up` | Повышение уровня | Что даёт уровень в этой игре |

### Data sources

Читает: `Document` с category=`glossary`, `brain`, `game_hidden`, `game_visible` (своего masterId).
Пишет: `Document` с category=`game_hidden` и `game_visible` (своего masterId).
**Не трогает:** `glossary`, `brain` (read-only).

### Правила поведения

1. Следовать правилам игры. Не отходить.
2. **Не менять glossary и brain.** Это зона Builder'а в режиме разработки.
3. Никогда не раскрывать скрытую информацию (game_hidden) другим игрокам.
4. Если игрок спрашивает «почему?» — объяснить через правила.
5. Не перегружать чат. Описание — коротко, по делу.
6. Предлагать конкретное действие, не ждать «что делаешь?».
7. Все изменения листов — **только через инструменты**, не прямая запись.
8. Если правил не хватает (крайний случай) — принять решение в духе игры и записать в лог (game_hidden).
9. **При старте после миграции:** прочитать migration summary → решить что обновить → обновить.

---

## Как skills подгружаются

1. Агент получает сообщение
2. Анализирует задачу
3. Если попадает под скил — загружает его инструкцию (из `masters/<id>/skills/`)
4. Следует инструкции скила, используя инструменты

Скилы — это `.md` файлы которые Builder создал при настройке.

---

## Иерархия принятия решений

```
Сообщение от админа / игрока
    │
    ▼
System prompt (кто я, задача, режим, ограничения по категориям)
    │
    ▼
Понять задачу → загрузить подходящий skill
    │
    ▼
Skill: используй инструменты X → Y → Z в этом порядке
    │
    ▼
Agentic loop: вызов инструмента → результат → думаю → ...
    │
    ▼
Ответ в чат
```

---

## Отличие от обычного агента

Обычный агент: system prompt + tools + agentic loop.

Наши агенты:

- **Builder** — создаёт структуру для другого агента (программирует не кодом, а документами в БД). Работает в режиме разработки. Пишет glossary и brain, не трогает игровые данные.
- **Game Master** — работает в структуре созданной Builder'ом; его скилы и инструменты частично динамические (зависят от игры). Работает в режиме игры. Читает glossary и brain (read-only), пишет game_hidden и game_visible.
- Оба работают с одним интерфейсом платформы (БД, чат, рендерер).
- Режимы не пересекаются: в development нет игроков, в game правила заморожены.
- При переключении dev→game Builder оставляет migration summary → Game Master решает что обновить.
