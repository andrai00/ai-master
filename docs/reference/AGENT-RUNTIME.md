# AI-агенты: раннеры и правила (Builder, Game Master)

> **См. также:**
> - `docs/reference/GOLDEN-RULES.md` — G18..G43 (агентные правила)
> - `docs/reference/ANTI-PATTERNS.md` — Builder Agent и LLM / Tools секции
> - `docs/reference/BACKEND.md` — Socket.IO push, очередь, БД
> - `src/shared/config/prompts/builder-system.md` — системный промпт Builder

## Builder Agent: fire-and-forget + Socket.IO

Сообщение AI — долгий процесс (до 2 мин). Нельзя заставлять Server Action ждать. Паттерн:

1. **Отправка:** Server Action сохраняет сообщение в БД → запускает `runBuilderAgent()` **без await** → сразу возвращает `{ success: true }`
2. **Получение:** ответ AI и прогресс — через Socket.IO (step-события в комнату `steps:{sessionId}`). Все клиенты (включая отправителя) получают одинаково
3. **Сокет всегда подключён** — клиент подключается при заходе на страницу, не только при отправке
4. **Типы step-событий:** `started`, `step`, `stopping`, `done`, `stopped`, `error`

## Builder Agent: остановка (Stop)

Три слоя прерывания должны срабатывать одновременно:

```ts
// При нажатии Stop:
cancelAll();            // глобальный флаг, все тулы проверяют throwIfCancelled()
stopProcessing(sessionId); // ac.abort() — прерывает HTTP-запросы модели
```

Каждый tool обязан начинаться с `throwIfCancelled()`. Инструменты задержки (ожидание парсинга файла) проверяют флаг каждые 100ms.

## Builder Agent: сжатие контекста

Общий модуль `src/shared/lib/agents/context-compress.ts` (`compressMessages`) используется билдером и GM через `prepareStep` в `generateText`. Хук вызывается перед каждым шагом:
- Оценить токены (`сообщения.length / 4`)
- Сравнить с `Math.min(contextLimit × 0.7, 24_000)` (порог капится, иначе 128K × 0.7 = 89.6K никогда не срабатывает на реальных промптах)
- При превышении: оставить system + последнее сообщение админа + **текущий tool-шаг** (не сжимать!), остальное заменить на саммари

## Транскрипт раундов (`AgentTranscript`) — вместо study-summary

Агенты работают в **единый цикл** (single loop): одна `streamText`-генерация с полным набором тулов. Двухфазная схема Plan → Execute и `study-summary` УДАЛЕНЫ — модель не перечитывает изученное, потому что всё уже в контексте одной генерации, а между раундами контекст восстанавливается из транскрипта.

- Модуль: `src/shared/lib/agents/transcript.ts` → `persistRun` + `buildTranscript`
- Таблица: `AgentTranscript` (тул-колы, результаты, финальный текст, статус, summarized)
- Реконструкция: parts-формат ai@7; tool-result — `role: "tool"` c `output: { type:"json", value }`
- Журнал изучения: `DocumentRead` (sessionId, documentId, readAt)
- Сжатие старых волн: фоновый `chat-summarizer.ts` → `ChatSummary`
- Удаление сообщения: `cascadeDeleteMessageRun` (транскрипт раунда удаляется — память «откатывается»)
- См. G40.

## Санитизация output'ов тулов (обязательно)

ai@7 валидирует результат тула как JSONValue: Prisma `Date` (updatedAt и т.п.) ломает шаг с «No output generated». Все тулсеты оборачиваются `wrapToolSet` (`src/shared/lib/agents/tool-output.ts`) — JSON-roundtrip output'а (Date → ISO-строка). НЕ добавлять тул в раннер без обёртки.

## Ретрай пустого ответа (единый цикл)

Если модель вызвала тулы, но не написала текст — ОДИН retry БЕЗ тулов с `FORCE_ANSWER_PROMPT`; retry получает результаты текущего раунда через `stepsToModelMessages` (та же JSON-обёртка). Затем fallback-сообщение. Никаких тулов в retry.

**Важно:** любая пересборка истории из steps (ретраи) обязана отбрасывать tool calls без парного tool-result — иначе `AI_MissingToolResultsError`. Тот же guard, что в `persistRun`/`buildTranscript`; регрессионный тест `run-steps.test.ts`.

## Builder Agent: ретраи

`generateText` в цикле до 5 попыток, экспоненциальный backoff. Ретраить только transient (сеть, Invalid JSON). НЕ ретраить AbortError, ошибки конфигурации.

## Формулы (лист персонажа)

Производные значения листа считает движок (`src/shared/lib/formula/`). Формат — ОДИН ` ```formula `-блок в НАЧАЛЕ листа:

```formula
str: 16
level: 1
hd_size: 8
base_ac: 14

str_mod = floor((str-10)/2)
prof = floor((level-1)/4)+2
ac = base_ac + dex_mod
```

- `имя: число` — база (вводит игрок); `имя = выражение` — производная формула (mathjs, ссылается на базу и другие формулы, порядок не важен). Legacy `name:`/`expr:`-пары тоже поддерживаются парсером.
- В тексте листа — только `$имя`; UI подставляет значение, формула видна по наведению (свёрнутая панель «Формулы · N»).
- **Ошибки → `err` и каскад:** нет переменной, деление на 0, не-finite, зацикливание — у формулы и у всех зависимых `err`. Никогда не угадывать значение.
- `create_document`/`update_document` возвращают `formulaValidation` (`{ ok, errorCount, errors }`) — после сохранения проверить и исправить.
- `read_document` возвращает `formulaValues` (имя → число) и `formulaErrors` (имя → причина); модель подставляет `$имя` и честно сообщает об ошибке формулы.

## Лимиты чтения документов: GM капит, Builder читает полностью

- **GM** (`gm-read-document.tool.ts`): `Math.min(args.limit ?? 3000, 8000)` — защита контекста от больших секций. GM не создаёт документы.
- **Builder** (`read-document.tool.ts`): полное чтение при отсутствии `offset`/`limit` — билдер создаёт/редактирует/разбивает документы, нужен полный текст. Кап заставлял дробить 25 КБ на 4 вызова (4 LLM-шага вместо 1).
- См. G41.

## Структура мозгов (правила для билдера)

Правила записаны в гайд билдера (`get_builder_guide.tool.ts`, topic `brain` → «Brain structure rules»):
- Секция ≤ ~6-7 КБ; темы больше — на под-секции `rules/<подтема>`
- `_index` — навигация + политика (3-5 КБ), без сводок секций
- Одна тема — одно место, дубли запрещены, ссылки `[[path]]`
- После разбивки — обновить роутер в `_index` и переименовать ссылки через `rename_document` (каскад обновит все `[[path]]`)
- См. G42.

## Builder Agent: метки шагов в бабле

Тул-имена не показываются пользователю. Вместо `create_document` — человекочитаемая фраза:

- **i18n:** ключ `builder.steps.{tool}` → строка (одна подпись на тул)
- Фразы должны описывать что ИИ делает в бизнес-терминах: «Прописывает глоссарий», а не «Вызывает create_document»
- Подписи нейтральные, без «мозга» для игроков (в билдере допустимо техничнее)
- Финал — шаг `final` («Пишет ответ»), эмитится перед сохранением ответа во всех трёх раннерах

Пример конфигурации в `ru.json`:
```json
"steps": {
  "explore_archive": "Разбирает архив",
  "read_file": "Читает файл",
  "bulk_import_to_glossary": "Загружает правила",
  "create_document": "Записывает новое",
  "update_document": "Обновляет запись",
  "search_rules": "Ищет правило",
  "glossary_overview": "Смотрит, что есть в правилах",
  "get_rolls": "Проверяет броски",
  "final": "Пишет ответ"
}
```

## Диагностика агентов (AGENT_TRACE / AGENT_DEBUG)

При `AGENT_TRACE=1` пишется таблица `TraceEvent` (`src/shared/lib/agents/trace.ts` → `traceAgent`): каждый промт (system+messages), каждый тул-вызов (имя+аргументы), финальный ответ, `finishReason`, ошибки, тайминги — с тегом чата/фазы/sessionId. Лимиты: args ≤2К, result ≤4К, prompt ≤20К. Фазы — `exec` / `retry` (plan/exec/idle больше нет). Без флага ничего не пишется; после анализа флаг убрать и дропнуть таблицу.

При `AGENT_DEBUG=1` (admin) строки вызовов тулов показываются прямо в чате в реальном времени (иконка + имя + аргументы) и после ответа — из транскрипта. Файловые логи (`logs/*.log`) удалены.

Важно:
- **Аргументы тулов**: AI SDK v7 кладёт их в `call.input`, не `call.args`. Писать `JSON.stringify(call.input ?? call.args ?? {})` — иначе `args: {}`.
- **elapsedMs**: реальный замер `performance.now()` вокруг генерации (exec/retry) — без него тайминги бесполезны.
- Замеры времени между шагами: `SELECT strftime('%H:%M:%S',createdAt) ts, phase, stepIndex, toolName FROM TraceEvent WHERE sessionId=... ORDER BY createdAt;`

```sql
SELECT phase, toolName, args FROM TraceEvent WHERE sessionId='...' ORDER BY createdAt;
SELECT phase, stepIndex, prompt FROM TraceEvent WHERE prompt IS NOT NULL ORDER BY createdAt;
SELECT phase, elapsedMs FROM TraceEvent WHERE elapsedMs IS NOT NULL AND sessionId='...' ORDER BY createdAt;
```

## Блокировка действий во время обдумывания

Пока `isProcessing(sessionId)` — отправка сообщений и выполнение бросков отклоняются (`chat.processingBlocked`). Мутации-хуки обязаны бросать ошибку при `{ success: false }` (не резолвить успешно), иначе игрок не увидит уведомление. См. `useExecuteRoll`.

## Заметки о игроках — всегда с playerId

- `write_note`/`create_document` принимают `playerId` для game_hidden (путь `hidden/players/<id>/` через `makePath`)
- `get_player_sheet` возвращает и скрытые заметки игрока (source-tagged)
- Общий трекер игроков («Создание персонажа: выбор игрока») ЗАПРЕЩЁН — заметка о конкретном игроке обязана быть привязана к его id
- Различать игроков только по id, не по именам
