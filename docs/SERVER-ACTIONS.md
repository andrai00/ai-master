# Серверные экшены Next.js и Ant Design

Дополнение к `docs/ARCHITECTURE.md`. Описывает замену серверных
axios-запросов на Server Actions и интеграцию Ant Design как UI-библиотеки
проекта.

---

## 1. Server Actions вместо `httpServer`

В базовой архитектуре для серверных запросов используется `httpServer`
(axios-инстанс с `"use server"`, читает токен из cookies, baseURL из
`process.env.URL_API`).

В этом проекте **все серверные запросы делаются через Server Actions**.
Никакого `httpServer`, никакого `instanceServer.ts`.

### 1.1. Почему Server Actions

- Нет отдельного API-роута — экшен это просто функция, вызывается как
  обычный async-вызов из клиентского кода или RSC.
- Next.js сам сериализует аргументы и ответ (через React Flight).
- Прогрессивное улучшение: работает без JS (формы).
- Токен и сессия читаются напрямую из `cookies()` / `headers()` — не нужно
  проксировать через axios- interceptor.

### 1.2. Где лежат экшены

```
src/shared/actions/{domain}/
  get-{entity}.ts       — серверный экшен (query)
  post-{entity}.ts      — серверный экшен (mutation)
  ...
```

Экшены — **серверный код**, помечены `"use server"`. Лежат в `shared/`,
потому что это общий слой данных, доступный из любого слайса.

### 1.3. Контракт экшена

Каждый файл экспортирует одну асинхронную функцию:

```ts
"use server";

import { verifySession } from "@/src/shared/lib/session";
import { cookies } from "next/headers";

export interface ISchemaGetProfile {
  payload: {};
  response: IUser;
}

export const getProfileAction = async (
  payload: ISchemaGetProfile["payload"]
): Promise<ISchemaGetProfile["response"]> => {
  const session = await verifySession();
  if (!session) throw new Error("Unauthorized");

  const res = await fetch(`${process.env.URL_API}/api-v1/users/me`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
```

### 1.4. Именование

- Функция: `{verb}{Entity}Action` → `getProfileAction`, `postLoginAction`,
  `updateCharacterSheetAction`.
- Интерфейс контракта: `ISchema{Verb}{Entity}` — как в базовой архитектуре,
  с полями `payload` и `response`.

### 1.5. Граница snake_case ↔ camelCase

Как и в базовой архитектуре (раздел 8.4), преобразование — внутри экшена.
Хук `use-*.ts` видит только camelCase:

```ts
// actions/characters/get-character-sheet.ts
"use server";

export interface ISchemaGetCharacterSheet {
  payload: { characterId: string };
  response: { character_name: string; hit_points: number; /* ... */ };
}

export interface IGetCharacterSheetResult {
  characterName: string;
  hitPoints: number;
}

const mapResponse = (r: ISchemaGetCharacterSheet["response"]): IGetCharacterSheetResult => ({
  characterName: r.character_name,
  hitPoints: r.hit_points,
});

export const getCharacterSheetAction = async (
  payload: ISchemaGetCharacterSheet["payload"]
): Promise<IGetCharacterSheetResult> => {
  // ... fetch ...
  return mapResponse(data);
};
```

### 1.6. Ревалидация кэша

После мутации экшен вызывает `revalidatePath()` или `revalidateTag()`:

```ts
"use server";

import { revalidatePath } from "next/cache";

export const updateCharacterSheetAction = async (payload: IUpdatePayload) => {
  // ... мутация ...
  revalidatePath("/sessions/[sessionId]/characters/[characterId]", "layout");
  return result;
};
```

---

## 2. React Query + Server Actions

Клиентские хуки `use-*.ts` вызывают серверный экшен через `mutationFn` /
`queryFn`.  Паттерн тот же что с `http-*.ts`, но вместо axios-вызова —
вызов экшена:

### 2.1. useQuery с серверным экшеном

```ts
// src/shared/api/profile/use-get-profile.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { getProfileAction } from "@/src/shared/actions/profile/get-profile";

export const useGetProfile = () =>
  useQuery({
    queryKey: ["getProfileAction"],
    queryFn: () => getProfileAction({}),
  });
```

### 2.2. useMutation с серверным экшеном

```ts
// src/shared/api/characters/use-update-character-sheet.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notification } from "antd";
import { updateCharacterSheetAction } from "@/src/shared/actions/characters/update-character-sheet";

export const useUpdateCharacterSheet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCharacterSheetAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getCharacterSheetAction"] });
      notification.success({ message: "Лист обновлён" });
    },
    onError: () => {
      notification.error({ message: "Ошибка при обновлении листа" });
    },
  });
};
```

### 2.3. RSC без React Query

В серверных компонентах (`layout.tsx`, `page.tsx` — если нужна предзагрузка)
экшен вызывается напрямую:

```tsx
// app/sessions/[sessionId]/page.tsx
import { getSessionAction } from "@/src/shared/actions/sessions/get-session";

export default async function SessionPage({ params }: { params: { sessionId: string } }) {
  const session = await getSessionAction({ sessionId: params.sessionId });
  return <SessionView data={session} />;
}
```

---

## 3. Клиентский `http` без изменений

Клиентский axios-инстанс `http` (`src/shared/api/instance.ts`) **остаётся**
для случаев когда нужен прямой вызов из браузера (например, загрузка
файлов, polling, стриминг).

Паттерн не меняется:

```ts
// src/shared/api/instance.ts
"use client";
import axios from "axios";

export const http = axios.create();
```

---

## 4. Ant Design — UI-библиотека

### 4.1. Подключение

```bash
pnpm add antd @ant-design/icons
```

### 4.2. Импорт

```ts
import { Button, Input, Modal, notification, Table, Tree, Tabs, Layout, Menu, Breadcrumb } from "antd";
```

Глобальный импорт — Ant Design поддерживает tree-shaking из коробки (с v5).

### 4.3. Тема и провайдер

`ConfigProvider` из Ant Design оборачивает всё приложение в `src/app-layer/index.tsx`:

```tsx
"use client";

import { ConfigProvider, theme, App } from "antd";
import ruRU from "antd/locale/ru_RU";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, FC, ReactNode } from "react";
import { queryClient } from "./providers/query-provider";

const Providers: FC<{ children: ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 6,
        },
      }}
    >
      <App>
        <Suspense fallback={<div>Loading...</div>}>
          {children}
        </Suspense>
      </App>
    </ConfigProvider>
  </QueryClientProvider>
);

export default Providers;
```

- `App` — обязательная обёртка для `notification`, `message`, `modal`
  (статические методы в Ant Design v5).
- `ruRU` — русская локаль.

### 4.4. CSS

Ant Design v5 использует CSS-in-JS (cssinjs), конфликтов с CSS Modules
нет. Глобальные токены темы — через `ConfigProvider`, дополнительные стили
— CSS Modules рядом с компонентом.

### 4.5. Ключевые компоненты для этого проекта

| Компонент | Где используется |
|---|---|
| `Tree` | Дерево файлов (сайдбар) |
| `Tabs` | Вкладки (чат, лист персонажа, правила) |
| `Layout` + `Sider` + `Content` | Каркас интерфейса |
| `Input` / `Input.TextArea` | Чат, формы |
| `Button` | Кнопки бросков, действия |
| `Modal` | Создание персонажа, диалоги |
| `notification` / `message` | Тосты (в `onSuccess` / `onError` хуков) |
| `Table` | Таблицы (инвентарь, список заклинаний) |
| `Menu` + `Breadcrumb` | Навигация |
| `Spin` | Загрузка |
| `Empty` | Пустое состояние (нет файлов, нет персонажа) |

### 4.6. CSS Modules + Ant Design

Компоненты размещаем в `ui/` слайса. Стили через CSS Modules. Если
компонент — тонкая обёртка над Ant Design, стилей может не быть:

```tsx
// src/features/character-sheet/ui/character-sheet-view.tsx
import styles from "./character-sheet-view.module.css";
import { Button, Descriptions, Tag } from "antd";

export const CharacterSheetView = ({ character }: { character: ICharacter }) => (
  <div className={styles.sheet}>
    <Descriptions title={character.name} bordered column={2}>
      <Descriptions.Item label="HP">
        {character.hitPoints} / {character.maxHitPoints}
      </Descriptions.Item>
      <Descriptions.Item label="Класс">{character.className}</Descriptions.Item>
    </Descriptions>
    <Button type="primary" className={styles.action}>
      Бросок атаки
    </Button>
  </div>
);
```

---

## 5. Итоговая структура запросов

| Сценарий | Раньше | Теперь |
|---|---|---|
| Клиентский запрос (браузер → API) | `http.get(...)` | `http.get(...)` (без изменений) |
| Серверный запрос (RSC, layout, action) | `httpServer.get(...)` | `getXxxAction(...)` (Server Action) |
| Мутация через React Query | `useMutation({ mutationFn: httpPostXxx })` | `useMutation({ mutationFn: postXxxAction })` |
| Прямая мутация в RSC | `httpServer.post(...)` | `postXxxAction(...)` + `revalidatePath()` |
