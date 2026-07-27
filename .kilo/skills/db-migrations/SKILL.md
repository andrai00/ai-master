# db-migrations

## TRIGGER
"add model", "create migration", "change schema", "new field", "add column", "prisma schema", "database change", "migrate"

## DECISION TREE
- Изменить схему БД → прочитай G14, G17 → workflow ниже
- Просто посмотреть данные → `sqlite3 data/ai-master.db "SELECT ..."`
- Накатить существующую миграцию → `npx prisma migrate dev && npx prisma generate`

## KEY FILES
- `prisma/schema.prisma` — схема БД
- `src/shared/lib/db/prisma.ts` — singleton getPrisma()
- `docs/GOLDEN-RULES.md` — G14 (@updatedAt + @default), G17 (migrate + generate)
- `docs/ANTI-PATTERNS.md` — Prisma & Database секция

## WORKFLOW

### Добавление модели / поля
1. Открыть `prisma/schema.prisma`
2. Добавить модель или поле
3. Для `DateTime @updatedAt` — всегда добавлять `@default(now())`: `updatedAt DateTime @default(now()) @updatedAt`
4. Сохранить
5. `npx prisma migrate dev --name <descriptive-name>`
6. `npx prisma generate`
7. **Сказать пользователю перезапустить dev-сервер** (не запускать самому)

### Drift detected (БД рассинхронизирована)
1. `npx prisma db push` — синхронизировать без потери данных
2. Если нужен файл миграции: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/XXXX_manual/migration.sql`

### Ручная проверка БД
```bash
sqlite3 data/ai-master.db ".tables"
sqlite3 data/ai-master.db ".schema User"
sqlite3 data/ai-master.db "SELECT * FROM User LIMIT 5"
```

## CHECKLIST
- [ ] `@updatedAt` поля имеют `@default(now())` (G14)
- [ ] Выполнен `migrate dev` + `generate` (G17)
- [ ] Пользователь предупреждён о перезапуске dev-сервера
- [ ] Новые поля учтены в server actions (create/edit)
- [ ] Старый Prisma-клиент не закеширован в globalThis
