# Архитектура и паттерны

> ⚠️ **Канонический FSD-шаблон.** Для ai-master переопределён:
> - `docs/SERVER-ACTIONS.md` — Server Actions вместо axios/httpServer
> - `docs/UI-DESIGN.md` — дизайн-система проекта
> - `docs/CODING.md` — актуальные правила кодинга

Универсальная инструкция по архитектуре и паттернам для всех наших проектов на
Next.js + React + TypeScript. Описывает базовый стек, структуру кода, правила
именования и работу с данными. UI-библиотеки и прикладные пакеты выбираются в
каждом проекте отдельно — здесь их нет.

## 1. Основные принципы

- **FSD + Next.js App Router**, ориентированный на клиентскую часть
  (client-side first), серверная часть — только для роутинга, гардов и
  серверных API-вызовов.
- **TypeScript строгий** (`"strict": true`).
- **Слои FSD**: импорты идут только сверху вниз, обратные зависимости запрещены.
- **Public API слайса** — только через `index.ts`. Глубокий импорт во внутренности
  чужого слайса запрещён.

### Базовый стек (один и тот же на все проекты)

| Библиотека | Роль |
|---|---|
| `next` (App Router, v15+, React 19) | каркас приложения, роутинг |
| `typescript` | типизация |
| `axios` | HTTP-клиент |
| `@tanstack/react-query` | server-state, кэш, query/mutation |
| `zustand` | глобальный client-state |
| `react-hook-form` + `@hookform/resolvers/zod` | формы |
| `zod` | схемы и валидация |
| `jose` / `jwt-decode` | работа с JWT |
| `server-only` | защита серверного кода от попадания в клиентский бандл |

Прикладные библиотеки (компоненты, утилиты, анимации) выбираются на уровне
конкретного проекта и в этой доке не фиксируются.

---

## 2. Структура директорий

### 2.1. `/app/` — тонкий слой роутинга Next.js

В каждой директории живут **только**:

1. **`page.tsx`** — реэкспорт страницы из `src/pages-layer/{slug}`:
   ```tsx
   export { default } from "@/src/pages-layer/profile";
   ```
2. **`layout.tsx`** — `Metadata`, серверные гарды (`verifySession`, `redirect`),
   обёртка в общие layout-виджеты из `src/widgets/`:
   ```tsx
   import { verifySession } from "@/src/shared/lib/session";
   import { LayoutAll } from "@/src/widgets/layout-all";
   import { LayoutBlack } from "@/src/widgets/layout-black";
   import { Metadata } from "next";
   import { redirect } from "next/navigation";

   export const metadata: Metadata = { title: "Профиль" };

   export default async function RootLayout({ children }: { children: React.ReactNode }) {
     const session = await verifySession();
     if (!session) redirect("/");
     return (
       <LayoutAll role={session.role}>
         <LayoutBlack>{children}</LayoutBlack>
       </LayoutAll>
     );
   }
   ```
3. Служебные файлы Next.js: `loading.tsx`, `error.tsx`, `not-found.tsx`,
   `route.ts` (для API-роутов в `app/api/...`).

В `/app/` **запрещены**: бизнес-логика, стили, компоненты, состояние. Любой UI
и логика страницы — в `src/pages-layer/{slug}/`.

### 2.2. `/src/` — основной код

```
src/
  app-layer/      — глобальные настройки и провайдеры приложения
  pages-layer/    — страницы (реализация, реэкспортируется в /app/)
  widgets/        — составные UI-блоки, layout-ы
  features/       — функциональные модули
  entities/       — бизнес-сущности
  shared/         — переиспользуемое:
    api/          — http- и use- функции, axios-инстансы
    lib/          — хуки, утилиты, store, interfaces, enums, const, types
    ui/           — UI-примитивы и проектные стили
    config/       — конфиг
```

Суффикс `-layer` нужен, чтобы не конфликтовать с папкой `/app/` Next.js и
зарезервированным именем `pages/`.

### 2.3. `/public/` — статические файлы и медиа.

---

## 3. Структура слайса (entities / features / widgets / pages-layer)

Каноническая троица FSD:

```
{slice}/
  ui/         — React-компоненты слайса
  model/      — типы, Zod-схемы форм, локальные стор-фрагменты, утилиты
  api/        — http-*.ts и use-*.ts (если у слайса есть свои запросы)
  index.ts    — Public API слайса
```

Не все папки обязательны: если у слайса нет API — нет `api/`; если только UI —
нет `model/`.

**Public API.** Снаружи импортируем только то, что реэкспортировано в `index.ts`.
Глубокий импорт во внутренности чужого слайса (например,
`import { EmailElement } from "@/src/features/login-form/ui/form/email"`) —
**запрещён**.

Типичный `index.ts`:
```ts
// features/login-form/index.ts
export * from "./ui";

// pages-layer/profile/index.ts
import { Page } from "./ui";
export default Page;
```

---

## 4. Соглашения по именованию

### 4.1. Файлы и директории

- Директории: `kebab-case` (`media-player/`, `login-form/`).
- Файлы компонентов: `kebab-case.tsx` (`email.tsx`, `login-form.tsx`).
- Файлы хуков и утилит: `camelCase.ts` или `kebab-case.ts` (`useBreakpoint.ts`,
  `format-duration.ts`).
- CSS-модули: `kebab-case.module.css`.

### 4.2. TypeScript

- **Интерфейсы:** префикс `I` → `IUser`, `IForm`, `IPayload`, `IGetStocksParams`.
- **Enum:** префикс `E` → `EUserRole`, `EStockStatus`.
- **Type-алиасы:** префикс `T` → `TUserRole`, `TStockStatus`.
- **Хуки:** `useXxx` → `useGetProfile`, `useBreakpoint`.
- **http-функции:** `httpXxx` (клиент) / `httpServerXxx` (сервер) →
  `httpGetProfile`, `httpServerPostLogin`.
- **Zod-схемы:** `XxxFormSchema` → `EditPublicInfoFormSchema`.
- **zustand-сторы:** `useXxxStore`, интерфейс `IXxxStore`.

**Enum + type-алиас всегда в паре**:
```ts
export enum EStockStatus {
  draft = "draft",
  accept = "accept",
  reject = "reject",
}

export type TStockStatus = `${EStockStatus}`;
```

### 4.3. Переменные

- Все идентификаторы внутри проектного кода — **camelCase, слитно, без `_`**
  (переменные, поля объектов, ключи `queryKey`, имена методов и т.д.).
- `snake_case` допустим **только** в типах http-функции (`ISchemaXxx["payload"]`
  / `["response"]`), если так требует бэкенд.
- В любом другом месте `snake_case` запрещён — преобразование делается
  адаптерами в `http-*.ts` (см. раздел 8.4).

---

## 5. Правила импорта

### 5.1. Абсолютные пути через алиас `@/`

В `tsconfig.json` алиас `@/*` указывает на **корень репозитория**, а не на
`/src/`. Поэтому импорты всегда вида `@/src/...`:

```ts
// Правильно
import { http } from "@/src/shared/api";
import { useGetProfile } from "@/src/shared/api/profile/use-get-profile";

// Неправильно
import { http } from "../../shared/api";
import { http } from "@/shared/api"; // @ это корень, а не src
```

### 5.2. Слоистость FSD

Слой может зависеть **только от нижележащих**. Порядок (сверху вниз):

```
app-layer → pages-layer → widgets → features → entities → shared
```

Круговые зависимости запрещены.

### 5.3. Public API слайса

Импорт из чужого слайса — только через его `index.ts`. Внутренняя структура
(`ui/`, `model/`, `api/`) — приватная.

---

## 6. Правила для компонентов

1. Один компонент — один файл.
2. Функциональные компоненты на TypeScript.
3. Только именованные экспорты для UI. Исключение: `page.tsx` страниц —
   `export default`.
4. Строго типизированные `props`.
5. Клиентские компоненты — с директивой `"use client"` в начале файла.

---

## 7. State management

**Server-state и client-state не путаем.**

### 7.1. Server-state (всё, что приходит из API) → `@tanstack/react-query`

Только React Query. **Не дублируем серверные данные в zustand**, не складываем
в Context — единственный источник правды это кэш React Query.

### 7.2. Client-state (UI-переключатели, фильтры, модалки, выбранная роль и т.п.) → `zustand`

Глобальный стор лежит в `src/shared/lib/store/{name}/index.ts`. Локальный стор
слайса — в его собственном `model/`.

Конвенция:
```ts
import { create } from "zustand";
import { TUserRole } from "../../enums/user-roles";

interface IRoleStore {
  value: TUserRole | null;
  setValue: (value: TUserRole | null) => void;
}

export const useRoleStore = create<IRoleStore>()((set) => ({
  value: null,
  setValue: (value) => set(() => ({ value })),
}));
```

- Имя хука: `useXxxStore`.
- Интерфейс с префиксом `I`.
- Действия — методы стора, а не отдельные функции снаружи.

### 7.3. Локальное состояние компонента → `useState` / `useReducer`

### 7.4. Что не используем

Нет Redux. Нет MobX. Нет Context для server-state.

---

## 8. API и запросы

### 8.1. Два axios-инстанса

**`http`** (`src/shared/api/instance.ts`) — клиентский:
- `"use client"`,
- baseURL ставится в рантайме через `setHttpBaseURL` (из `ConfigProvider`),
- токен — из `asyncLocalStorage` (`LOCAL_STORAGE_ACCESS_TOKEN`),
- 401 → refresh-token interceptor → повтор запроса.

**`httpServer`** (`src/shared/api/instanceServer.ts`) — серверный:
- `"use server"`,
- baseURL — `process.env.URL_API`,
- токен — из cookies (`next/headers`).

### 8.2. Структура папки операции в `/src/shared/api/{domain}/`

```
{domain}/
  http-{verb}-{entity}.ts   — функции запроса (httpXxx и/или httpServerXxx)
  use-{verb}-{entity}.ts    — React Query хук (useQuery/useMutation)
```

Файл `use-*.ts` **обязан лежать рядом** с `http-*.ts` в той же доменной папке.
Не в `lib/`, не в `entities/`, не в `features/`.

### 8.3. Контракт `ISchema`

В `http-*.ts` объявляется интерфейс `ISchema{Op}` с полями `payload` и
`response` в том виде, в котором их понимает бэкенд (допустим `snake_case`):

```ts
// src/shared/api/profile/http-get-profile.ts
import { http } from "@/src/shared/api";
import { httpServer } from "../instanceServer";
import { IUser } from "../../lib/interfaces/user";

export interface ISchemaGetProfile {
  payload: {};
  response: IUser;
}

export const httpGetProfile = (payload: ISchemaGetProfile["payload"]) =>
  http
    .get<ISchemaGetProfile["response"]>(`/api-v1/users/me`, { params: payload })
    .then((r) => r.data);

export const httpServerGetProfile = (payload: ISchemaGetProfile["payload"]) =>
  httpServer
    .get<ISchemaGetProfile["response"]>(`/api-v1/users/me`, { params: payload })
    .then((r) => r.data)
    .catch(() => null);
```

### 8.4. Граница snake_case ↔ camelCase

Бэкенд может отдавать поля в `snake_case`. Внутри проектного кода — **только
camelCase**. Преобразование — на границе, внутри `http-*.ts`:

```ts
// http-get-stocks.ts
export interface ISchemaGetStocks {
  payload:  { page?: number; page_size?: number; search?: string };
  response: { items: IStockRaw[]; total_count: number; page: number };
}

export interface IGetStocksParams { page?: number; pageSize?: number; search?: string }
export interface IGetStocksResult { items: IStock[]; totalCount: number; page: number }

const mapPayload = (i: IGetStocksParams): ISchemaGetStocks["payload"] => ({
  page: i.page,
  page_size: i.pageSize,
  search: i.search,
});

const mapResponse = (r: ISchemaGetStocks["response"]): IGetStocksResult => ({
  items: r.items.map(mapStock),
  totalCount: r.total_count,
  page: r.page,
});

export const httpGetStocks = (i: IGetStocksParams): Promise<IGetStocksResult> =>
  http
    .get<ISchemaGetStocks["response"]>(`/api-v1/stocks/`, { params: mapPayload(i) })
    .then((r) => mapResponse(r.data));
```

Хук `use-*.ts` оперирует **только camelCase-формами**. В компоненты, store,
формы `snake_case` не попадает никогда.

### 8.5. React Query — паттерны

**Один `QueryClient` на приложение** в `src/app-layer/providers/query-provider.ts`.
Используется и в `<QueryClientProvider>`, и в interceptor-ах axios для
`resetQueries()` при истечении сессии:

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  },
});
```

Модель кэша: «загрузили один раз → закэшировали → инвалидируем руками».

**Конвенция `queryKey`.** Первый элемент — **строка с именем http-функции**,
далее параметры в стабильном порядке:

```ts
queryKey: ["httpGetStocks", page, size, search]   // ✅
queryKey: ["stocks", page, size, search]          // ❌ неявно
```

**Инвалидация по префиксу:**
```ts
queryClient.invalidateQueries({ queryKey: ["httpGetStocks"] });        // все варианты
queryClient.invalidateQueries({ queryKey: ["httpGetStocks", page] });  // конкретный
```

**Хук `use-*.ts` — только обёртка** над http-функцией, без бизнес-логики:
```ts
// src/shared/api/stocks-home/use-get-stocks.ts
import { useQuery } from "@tanstack/react-query";
import { httpGetStocks } from "./http-get-stocks";

export const useGetStocks = ({ page, size, search }: IGetStocksParams) =>
  useQuery({
    queryKey: ["httpGetStocks", page, size, search],
    queryFn: () => httpGetStocks({ page, size, search }),
  });
```

**Мутации.** Все side-effects (тосты, инвалидация, redirect) — в `onSuccess` /
`onError` хука `use-*.ts`. Компонент только вызывает `mutateAsync`:
```ts
export const usePostLogin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IForm) => httpPostLogin(data),
    onSuccess: (data) => {
      // тост, redirect, инвалидация
      queryClient.resetQueries();
    },
    onError: (error) => {
      // тост об ошибке
    },
  });
};
```

**Серверные запросы (RSC, серверный layout)** — напрямую вызывают
`httpServer{Op}(...)`, без React Query.

---

## 9. Формы (`react-hook-form` + `zod`)

Все формы — `react-hook-form` + `zod` через `@hookform/resolvers/zod`. Никаких
ручных `useState`-форм.

### 9.1. Раскладка по файлам слайса

```
{slice}/
  model/
    {name}-form.ts          — IForm + FormSchema
  ui/
    form/
      index.tsx             — useForm + FormProvider + submit
      email.tsx             — поле через useFormContext / Controller
      password.tsx
  api/
    http-post-{op}.ts
    use-post-{op}.ts        — useMutation
```

Имя файла схемы — **`{name}-form.ts`** (например, `edit-public-info-form.ts`,
`edit-phone-form.ts`). Этот формат масштабируется при нескольких формах в
одном слайсе.

### 9.2. Контракт `model/{name}-form.ts`

```ts
import { z } from "zod";

export interface IEditPublicInfoForm {
  nickname: string;
  location: string;
}

export const EditPublicInfoFormSchema = z.object({
  nickname: z.string().max(50, { message: "Длина не более 50 символов" }).default(""),
  location: z.string().max(50, { message: "Длина не более 50 символов" }).default(""),
});
```

- Имя интерфейса: `I{Name}Form`.
- Имя схемы: `{Name}FormSchema`.

### 9.3. Контракт `ui/form/index.tsx`

```tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { FormSchema, IForm } from "../../model/login-form";
import { usePostLogin } from "../../api/use-post-login";

export const FormElement = () => {
  const form = useForm<IForm>({
    mode: "onChange",
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(FormSchema),
  });

  const { mutateAsync, isPending } = usePostLogin();

  const onSubmit = async (data: IForm) => {
    await mutateAsync(data);
    // навигация / тосты — тут или в onSuccess хука
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* поля */}
      </form>
    </FormProvider>
  );
};
```

### 9.4. Сложные/вложенные формы

Оборачиваем в `FormProvider`, дочерние поля используют `useFormContext` /
`Controller`. Все валидации — только через Zod, никаких ручных regex в
`onChange`.

---

## 10. Конфигурация `app/layout.tsx` и провайдеров

### 10.1. Root layout

`app/layout.tsx` подключает `<Providers>` из `src/app-layer/` и `globals.css`.
Больше ничего:

```tsx
import type { Metadata } from "next";
import Providers from "@/src/app-layer";
import "./globals.css";

export const metadata: Metadata = { title: "Название проекта" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 10.2. `src/app-layer/index.tsx`

```tsx
"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, FC, ReactNode } from "react";
import { ConfigProvider } from "@/src/shared/lib/context/config-context";
import { queryClient } from "./providers/query-provider";

const Providers: FC<{ children: ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <ConfigProvider>
      <Suspense fallback={<div>Loading...</div>}>
        {children}
      </Suspense>
    </ConfigProvider>
  </QueryClientProvider>
);

export default Providers;
```

UI- и тост-провайдеры (тема, snackbar и т.п.) подключаются здесь же, но это
**проектная деталь** — конкретная UI-библиотека выбирается в проекте, в этой
доке не фиксируется.

### 10.3. Серверные layout-ы внутри `/app/{slug}/layout.tsx`

- проверяют сессию через `verifySession`;
- делают `redirect` при отсутствии прав;
- оборачивают `children` в общие layout-виджеты (`LayoutAll` и т.п.).

---

## 11. Стили

### 11.1. Целевой стандарт — CSS Modules

Новые компоненты пишем на CSS Modules (`.module.css` рядом с компонентом).
Существующие компоненты на других подходах (Emotion, MUI `sx`) — постепенно
переносим на модули. Запретов на старые подходы нет.

Пример:
```tsx
// ui/button.tsx
import styles from "./button.module.css";

export const Button = ({ children }: { children: React.ReactNode }) => (
  <button className={styles.button}>{children}</button>
);
```

```css
/* ui/button.module.css */
.button {
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent);
  color: var(--color-on-accent);
}
```

### 11.2. Глобальные стили и темизация

- `app/globals.css` — общие сбросы и токены темы.
- Темизация — через CSS custom properties (`--color-*`, `--space-*` и т.п.).

---

## 12. Документация кода

1. JSDoc на нетривиальные компоненты и публичные функции.
2. Комментарии — про **«почему»**, а не про «что».
3. Сложные CSS-блоки — с пояснением.
4. Типы и интерфейсы — с описанием, если назначение неочевидно.

---

## 13. Соглашения по коммитам

Conventional Commits:

- `feat:` — новая функциональность
- `fix:` — исправление ошибок
- `docs:` — изменения в документации
- `style:` — форматирование, без изменения логики
- `refactor:` — рефакторинг
- `test:` — тесты
- `chore:` — сборка, инструменты, конфиги

---

## 14. Версии пакетов

На старте нового проекта — всегда **актуальные версии** всех зависимостей.
Особенно важно проверить последние версии `next`, `react`,
`@tanstack/react-query`, `zustand`, `react-hook-form`, `zod` — они активно
развиваются и периодически меняют API. Не копировать версии из старых
проектов.
