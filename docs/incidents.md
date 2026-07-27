# Incident & Bug Ledger

> Append-only журнал. Каждый реальный баг → строка.
> Агент перед работой проверяет журнал по своей области.

| Date | Area | Symptom | Root cause | Fix | Guard |
|------|------|---------|------------|-----|-------|
| 2026-07-27 | builder | Параллельная обработка файлов через БД-чанки ломала всё 2 раза подряд: лаги, долгая отправка, десинхронизация между админами | 1) SQLite single-writer — множественная запись чанков блокировала все остальные запросы. 2) Отсутствие контроля concurrent AI-вызовов — 10+ generateText() одновременно. 3) React Query не синхронизирует мутации между клиентами | 1) better-queue (max 3 concurrent) + BuilderJob table. 2) UploadedFile — весь текст файла одной записью, чанки через slice() в памяти. 3) SSE-push для удаления сообщений (builder_message_deleted) | G21, G22, G23, G24 |
| 2026-07-27 | ui | На мобилке табы Documents не доскролливались до конца из-за overflow-кнопки «...» antd Tabs | antd Tabs рендерит `ant-tabs-nav-operations` (кнопку «...») которая занимает место справа и визуально блокирует скролл | `ant-tabs-nav-operations { display: none }`, `ant-tabs-nav-list { overflow-x: auto; transform: none }` | ANTI-PATTERNS: UI / Страницы |
| 2026-07-27 | ui | Дизайн шапок всех страниц различался: разные font-size (13/16/18px), padding, border. Мобильная кнопка меню на отдельных рядах или отсутствовала | Каждая страница использовала свои inline-стили для заголовка. Не было единого компонента | `<PageHeader>` компонент + `MobileMenuProvider` контекст. Все страницы переведены на единый компонент | G25 |
| 2026-07-27 | sidebar | Дубликат «AI Master» в ChatNav и AdminSection — два пути на одну страницу | Навигационный пункт `/admin/ai-settings` был добавлен в обе секции | Удалён из ChatNav, оставлен только в AdminSection | ANTI-PATTERNS: UI / Страницы |

## Legend
- **Area:** auth, builder, chat, db, ui, i18n, admin, sidebar, game
- **Guard:** что предотвратит повторение (правило, линтер, тест, документация)
