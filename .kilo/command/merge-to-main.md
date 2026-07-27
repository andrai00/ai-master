# merge-to-main

Порядок влития ветки в main.

## Правила

1. **Перед мержем ветка ДОЛЖНА быть переименована** в формат `type/summary-text` (kebab-case, как коммит-месседж без скобок).
2. **Всегда merge (--no-ff), никогда cherry-pick.**
3. Формат имени ветки: `fix/...`, `feat/...`, `refactor/...`, `chore/...`

## Порядок действий

```sh
# 1. Переименовать ветку
git branch -m <old-name> fix/short-description

# 2. Переключиться на main
git checkout main

# 3. Влить ветку (не cherry-pick!)
git merge fix/short-description --no-ff

# 4. Удалить слитую ветку (опционально)
git branch -d fix/short-description
```

## Примеры

| Было | Стало |
|------|-------|
| `working-fisherman` | `fix/reset-builder-loading-on-game-switch` |
| `hotfix123` | `fix/auth-token-expiry` |
| `newfeature` | `feat/add-document-export` |
