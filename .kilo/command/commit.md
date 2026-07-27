# commit

Правила написания коммит-сообщений.

## Формат

```
type(scope): краткое описание (≤72 символа, imperative mood)

Подробное описание того что сделано, почему, и какие файлы затронуты.
Можно несколько абзацев. Без ограничения по длине.

- Конкретные изменения: файл → что поменялось
- Причина изменений
- Связанные issue/баги если есть
```

## Обязательно

1. **Заголовок** — `type(scope): описание`, ≤72 символа, imperative mood (English)
2. **Тело** — после пустой строки, подробное описание:
   - Что именно сделано
   - Почему (причина/баг)
   - Какие файлы затронуты и как
   - Любые неочевидные решения

## Запрещено

- Коммит без тела (только заголовок)
- Коммит с телом «fix» или «update»
- Тело короче одного осмысленного предложения

## Пример

```
fix(builder): reset loading state on game switch

Builder chat bubble showed pulsing dots animation after switching games
because router.refresh() preserved React state (typing=true), sessionId
cache wasn't invalidated, and SSE kept polling old session.

Changes:
- game-events.ts — added "game_switched" to TGameEvent
- switch-game.ts — broadcast "game_switched" after activeGame update
- shell.tsx — handle "game_switched" SSE event: full invalidate + refresh
- useSwitchGame.ts — invalidate builder session & messages queries
- builder-chat-view.tsx — reset typing/stopping on sessionId change

Fixes the bug where loading indicator persisted across game switches.
```

## Types

| Type | Назначение |
|------|-----------|
| `feat` | Новая фича |
| `fix` | Исправление бага |
| `refactor` | Переработка кода без изменения поведения |
| `chore` | Обслуживание (зависимости, конфиги, скрипты) |
| `style` | Форматирование, отступы (не CSS-стили) |
| `docs` | Документация |
| `build` | Сборка, CI/CD |
