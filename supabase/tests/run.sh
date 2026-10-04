#!/usr/bin/env bash
# Recrea una base local, aplica stubs + migraciones y ejecuta las pruebas SQL.
# Uso: bash supabase/tests/run.sh   (requiere PostgreSQL local y psql)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(runuser -u postgres -- psql -v ON_ERROR_STOP=1 -X -q)
runuser -u postgres -- psql -X -q -c "drop database if exists inv_test" -c "create database inv_test"
for f in "$DIR/tests/00_supabase_stubs.sql" "$DIR"/migrations/*.sql; do
  echo ">> $(basename "$f")"
  cat "$f" | "${PSQL[@]}" -d inv_test
done
for f in "$DIR"/tests/[1-9]*.sql; do
  echo ">> $(basename "$f")"
  cat "$f" | "${PSQL[@]}" -d inv_test
done
echo "TODAS LAS PRUEBAS SQL PASARON"
