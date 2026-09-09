#!/bin/sh
# Compose app entrypoint: one-time roles, journaled migrate, seed, then serve.
# Secrets arrive via environment — never from a file in the image.
set -eu

if [ -n "${POSTGRES_ADMIN_URL:-}" ]; then
  echo "self-host: bootstrapping roles + database"
  pnpm self-host:bootstrap
fi

echo "self-host: applying journaled migrations"
pnpm migrate

echo "self-host: seeding demo accounts (idempotent)"
pnpm seed

echo "self-host: starting"
exec pnpm start
