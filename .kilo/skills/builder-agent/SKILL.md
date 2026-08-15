# builder-agent

## TRIGGER
"builder", "builder agent", "builder-runner", "system prompt", "agent tools", "AI agent", "Game Master setup", "rule processing"

## DECISION TREE
- Изменить системный промпт Builder → `src/shared/config/prompts/builder-system.md`
- Добавить/изменить tool → `src/shared/lib/agents/tools/<name>.tool.ts`
- Изменить логику runner → `src/shared/lib/agents/builder-runner.ts`
- Изменить парсинг файлов → `src/shared/lib/agents/file-parser.ts`
- Изменить отображение в чате → `src/features/chat-panel/`, `src/pages-layer/builder-chat/`

## KEY FILES
- `src/shared/config/prompts/builder-system.md` — системный промпт Builder Agent
- `src/shared/lib/agents/builder-runner.ts` — основной runner (запуск, шаги, ретраи, стоп)
- `src/shared/lib/agents/step-tracker.ts` — трекинг шагов для SSE
- `src/shared/lib/agents/parse-cancel.ts` — логика отмены
- `src/shared/lib/agents/file-cache.ts` — кэш загруженных файлов
- `src/shared/lib/agents/file-parser.ts` — парсинг PDF/текст
- `src/shared/lib/agents/tools/` — все инструменты агента
- `src/shared/actions/builder/` — server actions (send-message, stop-builder, clear-chat)
- `src/app/api/stream/route.ts` — единый SSE endpoint (глобальные + step-события)
- `src/app/api/builder/upload/route.ts` — загрузка файлов
- `docs/GOLDEN-RULES.md` — G19 (fire-and-forget), G18 (SSE-push)
- `docs/ANTI-PATTERNS.md` — Builder Agent секция

## WORKFLOW

### Добавление нового tool
1. Создать `src/shared/lib/agents/tools/<name>.tool.ts`
2. Tool ОБЯЗАН начинаться с `throwIfCancelled()` (см. G19)
3. Зарегистрировать tool в `builder-runner.ts`
4. Если tool долгий — проверять `throwIfCancelled()` каждые 100ms
5. Добавить i18n-ключ `builder.steps.<tool>` в `ru.json` и `en.json`
6. Проверить: `npx tsc --noEmit`

### Изменение builder-runner
1. **Fire-and-forget:** server action сохраняет сообщение → `runBuilderAgent()` без await → return `{ success: true }`
2. **SSE:** прогресс через `/api/stream` (step-события), типы: `started`, `step`, `stopping`, `done`, `stopped`, `error`
3. **Контекст:** `prepareStep` проверяет токены → при превышении `contextLimit × 0.7` — саммаризация
4. **Ретраи:** до 5 попыток, exponential backoff, только transient ошибки
5. **Остановка:** `cancelAll()` + `stopProcessing(sessionId)` — два слоя одновременно

### Изменение системного промпта
1. Открыть `src/shared/config/prompts/builder-system.md`
2. Переменные в фигурных скобках (`{builderMode}`, `{uiLanguage}`) заменяются рантайм
3. После изменения — `npx tsc --noEmit`

## CHECKLIST
- [ ] Новые tools имеют `throwIfCancelled()` первым вызовом
- [ ] Server actions не делают `await` на `runBuilderAgent()` (G19)
- [ ] SSE endpoint корректно шлёт все 6 типов событий
- [ ] Ретраи только для transient ошибок (сеть, JSON), не для AbortError
- [ ] i18n-ключи `builder.steps.*` добавлены в оба языка
- [ ] `npx tsc --noEmit` проходит
