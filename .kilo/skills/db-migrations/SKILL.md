# db-migrations

## TRIGGER
"add model", "create migration", "change schema", "new field", "add column", "prisma schema", "database change", "migrate"

## DECISION TREE
- Изменить схему БД → прочитай G14, G17 → workflow ниже
- Просто посмотреть данные → `sqlite3 data/ai-master.db "SELECT ..."`
- Синхронизировать схему с БД → `npx prisma db push && npx prisma generate`

## KEY FILES
- `prisma/schema.prisma` — схема БД
- `src/shared/lib/db/prisma.ts` — singleton getPrisma()
- `docs/reference/GOLDEN-RULES.md` — G14 (@updatedAt + @default), G17 (db push + generate)
- `docs/reference/ANTI-PATTERNS.md` — Prisma & Database секция

## WORKFLOW

### Добавление модели / поля
1. Открыть `prisma/schema.prisma`
2. Добавить модель или поле
3. Для `DateTime @updatedAt` — всегда добавлять `@default(now())`: `updatedAt DateTime @default(now()) @updatedAt`
4. Сохранить
5. `npx prisma db push` — применяет схему к БД (миграции-файлы не используются, нет прода)
6. `npx prisma generate`
7. **Сказать пользователю перезапустить dev-сервер** (не запускать самому)

### Drift detected (БД рассинхронизирована)
1. `npx prisma db push` — синхронизировать без потери данных. Если Prisma требует `--accept-data-loss` и это реальная потеря — спросить пользователя.
2. Для сброса dev-БД целиком — удалить `data/ai-master.db` и заново `db push` (не `prisma migrate reset`)

### Ручная проверка БД
```bash
sqlite3 data/ai-master.db ".tables"
sqlite3 data/ai-master.db ".schema User"
sqlite3 data/ai-master.db "SELECT * FROM User LIMIT 5"
```

## CHECKLIST
- [ ] `@updatedAt` поля имеют `@default(now())` (G14)
- [ ] Выполнен `db push` + `generate` (G17)
- [ ] Пользователь предупреждён о перезапуске dev-сервера
- [ ] Новые поля учтены в server actions (create/edit)
- [ ] Старый Prisma-клиент не закеширован в globalThis
