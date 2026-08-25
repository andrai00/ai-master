# Форматирование и соглашения об именовании

> **См. также:** `docs/reference/GOLDEN-RULES.md` — правила, `docs/reference/FRONTEND.md` — i18n в UI.

## Типы и именование

- Интерфейсы: префикс `I` — `IUser`, `IForm`
- Enum: префикс `E` — `EUserRole`
- Хуки: `useXxx`
- Компоненты: `kebab-case.tsx`
- Файлы хуков: `camelCase.ts`
- Серверные экшены: `{verb}{Entity}Action` — `loginAction`, файл `{verb}-{entity}.ts`
- Клиентские хуки данных: `use-*.ts` в `src/shared/api/{domain}/`

## JSON-локали (i18n)

Строки JSON-локалей — всегда с trailing comma:

```json
"key": "value",
"lastKey": "value"
```

Последний элемент секции без запятой. Все остальные с запятой.

## Em-dash

Em-dash (`—`) запрещён в коде, комментариях, строках и UI-текстах — это маркер ИИ-текста. Вместо него — обычный дефис `-`. Исключение — только если `—` является функциональным литералом (regex-класс, парсер/санитайзер). См. G-правила.
