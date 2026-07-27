# auth-flow

## TRIGGER
"login", "logout", "auth", "session", "setup", "password", "JWT", "authorization", "permissions", "admin access"

## DECISION TREE
- Добавить/auth-flow → `src/shared/actions/auth/`
- Изменить сессии → `src/shared/lib/auth/session.ts`
- Изменить middleware → `src/proxy.ts`
- Изменить пароли → `src/shared/lib/auth/password.ts`
- Админ-доступ → `src/shared/actions/admin/`

## KEY FILES
- `src/shared/actions/auth/login.ts` — вход
- `src/shared/actions/auth/setup-admin.ts` — создание первого админа
- `src/shared/actions/auth/setup-check.ts` — проверка есть ли админ
- `src/shared/lib/auth/session.ts` — JWT через jose, кука `session_token`
- `src/shared/lib/auth/password.ts` — bcryptjs, 10 раундов
- `src/proxy.ts` — защита роутов (всё кроме /login, /setup)
- `src/pages-layer/login/ui/login-form.tsx` — форма входа
- `src/pages-layer/setup/ui/setup-form.tsx` — форма первоначальной настройки
- `src/widgets/sidebar/ui/sidebar.tsx` — выход, профиль

## WORKFLOW

### Добавление нового защищённого роута
1. Создать страницу в `src/app/<route>/page.tsx`
2. Ничего не делать в `proxy.ts` — все роуты кроме `/login` и `/setup` защищены автоматически

### Изменение сессий
1. JWT payload: только `{ sub, sid }` — без ролей
2. Кука: `session_token`, httpOnly
3. Библиотека: `jose` (не `jsonwebtoken`)
4. Хэширование: `bcryptjs`, 10 раундов

### Управление пользователями
1. Пользователи создаются админом, без саморегистрации
2. Server actions: `src/shared/actions/admin/` (create-player, edit-user, delete-user)
3. React Query хуки: `src/shared/api/admin/use-*.ts`
4. Таблица: `src/pages-layer/admin-users/ui/users-table.tsx`

### Проверка доступа к странице
```ts
// Для dev-страниц — дополнительно проверять режим игры (G15):
const activeGame = await getActiveGame();
if (activeGame?.mode !== "development") redirect("/");
```

## CHECKLIST
- [ ] JWT через `jose`, не `jsonwebtoken`
- [ ] Пароли через `bcryptjs`, 10 раундов
- [ ] Кука `session_token`, httpOnly
- [ ] Саморегистрация отключена
- [ ] Новый роут автоматически защищён proxy.ts
- [ ] Dev-страницы проверяют режим игры (G15)
