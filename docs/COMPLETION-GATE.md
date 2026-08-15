# Completion Gate — чеклист перед коммитом

> Выполнить ВСЕ пункты перед тем как предложить пользователю закоммитить.

---

## Code Quality
- [ ] `npx tsc --noEmit` проходит без ошибок
- [ ] `npx next lint` проходит без ошибок и warnings

## Golden Rules (проверить затронутые)
- [ ] G1: Новый код использует Server Actions, не API Routes (без необходимости)
- [ ] G2: Новые синглтоны через `globalThis`, не `let` на уровне модуля
- [ ] G3: Все цвета через CSS-переменные, без хардкода
- [ ] G4: Все статические тексты через `t()` в обоих языках (ru + en)
- [ ] G5: Иконка-онли кнопки обёрнуты в `<Tooltip>`
- [ ] G6: Таблицы с `pagination={{ pageSize: 10, hideOnSinglePage: true }}`
- [ ] G7: Деструктивные действия с `Popconfirm` или `modal.confirm`
- [ ] G8: Danger/красный только для удаления
- [ ] G9: `modal.confirm` с `mask: { closable: true }`
- [ ] G10: React Query только через хуки `use-*.ts`
- [ ] G11: Мутации через `useMutation` + инвалидация кэша
- [ ] G13: Switch только для мгновенных toggle, режимы — кнопка + confirm
- [ ] G14: `@updatedAt` поля имеют `@default(now())`
- [ ] G15: Dev-страницы проверяют режим игры
- [ ] G16: Новые пункты меню с `usePathname()` + активный стиль
- [ ] G17: После изменения схемы: `db push` + `generate`
- [ ] G18: Глобальные события через SSE-push
- [ ] G19: Builder Agent: fire-and-forget, без await
- [ ] G22: Контент полным текстом, одна запись на документ
- [ ] G23: Импорт файлов — `explore_archive()` (дерево, без чтения контента) + `bulk_import_to_glossary`
- [ ] G24: SSE-push для мутаций чата между клиентами
- [ ] G25: Все страницы через единый `<PageHeader>`
- [ ] G26: Real-time через EventEmitter push, без polling
- [ ] G27: DB-update → await → broadcast
- [ ] G28: Тулзы не фильтруются по режиму, принимают UUID и путь

## Documentation (проверить)
- [ ] Я тронул domain rule → обновил AGENTS.md invariants
- [ ] Я добавил новую директорию с нетривиальным кодом → создал AGENTS.md
- [ ] Я наткнулся на реальный gotcha → записал в ANTI-PATTERNS.md
- [ ] Я нашёл/починил баг → добавил строку в incidents.md
- [ ] Я изменил сложный flow → обновил flow-документацию

## Mobile / Adaptive
- [ ] Новые UI-компоненты работают на мобилке (кнопки ≥32px)
- [ ] CSS-модули содержат `@media (max-width: 767px)` блок
- [ ] Контент не вылезает за экран на узких ширинах

## Final
- [ ] Изменения покрывают только заявленную задачу (без scope creep)
- [ ] Пользователь явно просил закоммитить
