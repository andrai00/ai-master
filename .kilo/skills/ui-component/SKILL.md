# ui-component

## TRIGGER
"create component", "add page", "build form", "add button", "new UI", "component", "layout", "page design"

## DECISION TREE
- Создать страницу → `src/pages-layer/<domain>/ui/<view>.tsx`
- Создать переиспользуемый компонент → `src/features/<name>/ui/<component>.tsx`
- Создать виджет → `src/widgets/<name>/ui/<widget>.tsx`
- Изменить дизайн-систему → `docs/reference/FRONTEND.md`

## KEY FILES
- `docs/reference/FRONTEND.md` — 🎨 дизайн-система + структура интерфейса
- `docs/reference/ANTI-PATTERNS.md` — UI / Ant Design + Стили секции
- `docs/reference/GOLDEN-RULES.md` — G3 (цвета), G4 (i18n), G5 (Tooltip), G6 (pagination), G7 (подтверждение), G8 (danger), G9 (modal), G13 (Switch), G16 (usePathname)
- `src/app/globals.css` — глобальные CSS-переменные
- `src/app-layer/index.tsx` — ConfigProvider, тема, провайдеры

## WORKFLOW

### Создание нового UI-компонента
1. Определить слой: `pages-layer` / `features` / `widgets`
2. Создать папку: `src/<layer>/<name>/ui/`
3. Создать компонент: `<name>.tsx`
4. Создать стили: `<name>.module.css`
5. Создать `index.ts` — public API слайса
6. СРАЗУ добавить `@media (max-width: 767px)` блок в CSS Module (G3)
7. Все тексты через `t()` (G4)
8. Все цвета через `var(--...)` (G3)
9. Иконки только `@ant-design/icons`
10. Кнопки: `controlHeight` из темы, `align-items: center`

### Таблицы
- Всегда: `pagination={{ pageSize: 10, hideOnSinglePage: true }}` (G6)
- Колонки с `responsive` (скрывать на мобилке)
- Заголовки колонок через `t()`

### Модалки / диалоги
- Деструктивные действия: `Popconfirm` (G7)
- Смена режимов: `modal.confirm` из `App.useApp()` + `mask: { closable: true }` (G9)
- Danger только для удаления (G8)
- Switch только для мгновенных toggle (тема, звук) (G13)

### Формы
- `input + кнопка` рядом, высота кнопки = `controlHeight` (30px)
- Инпут без фиксированной высоты
- `Ant Design Card` НЕ использовать для группировки полей — простой `<div>`
- `Input.TextArea` — только контролируемое состояние (`useState`)

### Сайдбар / навигация
- Активная страница: `usePathname()` + `startsWith()` (G16)
- Активный стиль: `background: var(--bg-active); color: var(--text-primary)`

## CHECKLIST
- [ ] CSS Module создан с `@media (max-width: 767px)` блоком
- [ ] Все тексты через `t()` (G4)
- [ ] Все цвета через CSS-переменные (G3)
- [ ] Иконка-онли кнопки в `<Tooltip>` (G5)
- [ ] Таблицы с `pagination={{ pageSize: 10, hideOnSinglePage: true }}` (G6)
- [ ] Деструктивные действия с подтверждением (G7)
- [ ] Danger только для delete (G8)
- [ ] `modal.confirm` с `mask: { closable: true }` (G9)
- [ ] Новый пункт меню с `usePathname()` (G16)
- [ ] Компонент работает на мобилке (кнопки ≥32px)
