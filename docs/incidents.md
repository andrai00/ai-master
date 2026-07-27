# Incident & Bug Ledger

> Append-only журнал. Каждый реальный баг → строка.
> Агент перед работой проверяет журнал по своей области.

| Date | Area | Symptom | Root cause | Fix | Guard |
|------|------|---------|------------|-----|-------|
| 2026-07-27 | builder | Параллельная обработка файлов через БД-чанки ломала всё 2 раза подряд: лаги, долгая отправка, десинхронизация между админами | 1) SQLite single-writer — множественная запись чанков блокировала все остальные запросы. 2) Отсутствие контроля concurrent AI-вызовов — 10+ generateText() одновременно. 3) React Query не синхронизирует мутации между клиентами | 1) better-queue (max 3 concurrent) + BuilderJob table. 2) UploadedFile — весь текст файла одной записью, чанки через slice() в памяти. 3) SSE-push для удаления сообщений (builder_message_deleted) | G21, G22, G23, G24 |

## Legend
- **Area:** auth, builder, chat, db, ui, i18n, admin, sidebar, game
- **Guard:** что предотвратит повторение (правило, линтер, тест, документация)
