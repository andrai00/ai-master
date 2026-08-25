#!/bin/sh
set -e

mkdir -p data

# JWT_SECRET: берём из окружения, либо генерируем случайный и сохраняем
# в volume (data/jwt-secret), чтобы он переживал перезапуски контейнера.
if [ -z "$JWT_SECRET" ]; then
  if [ -f data/jwt-secret ]; then
    JWT_SECRET=$(cat data/jwt-secret)
  else
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "$JWT_SECRET" > data/jwt-secret
    chmod 600 data/jwt-secret
  fi
  export JWT_SECRET
fi

pnpm exec prisma db push
exec node server.mjs
