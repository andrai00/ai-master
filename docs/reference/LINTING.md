# Линтинг и проверка типов

> **См. также:** `docs/reference/COMMANDS.md` — как запускать.

## Команды проверки

```sh
pnpm exec tsc --noEmit    # проверка типов
pnpm lint                 # ESLint (eslint.config.mjs)
pnpm test                 # Vitest (vitest.config.mjs)
```

## Правило: проверка после изменений

После внесения правок в несколько файлов — запустить `pnpm exec tsc --noEmit` и `pnpm lint`. Не полагаться только на билд-ошибки в браузере — они показывают не всё. Особенно после массовых изменений интерфейсов или серверных экшенов.

## Конфигурация

- `eslint.config.mjs` — ESLint 9 (flat config), `eslint-config-next`
- `tsconfig.json` — строгий TypeScript
- `vitest.config.mjs` — тесты (`.test.ts` рядом с кодом)
