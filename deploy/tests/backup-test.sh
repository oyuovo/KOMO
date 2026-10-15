#!/bin/bash
# Local regression tests; replaces docker/pg_dump, never connects to a database.
set -euo pipefail
SCRIPT=$(cd "$(dirname "$0")/.." && pwd)/backup.sh
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK/bin"
export PATH="$WORK/bin:$PATH"
export FIXTURE="$WORK/dump.sql"
head -c 8192 /dev/urandom | base64 > "$FIXTURE"

cat > "$WORK/bin/docker" <<'SH'
#!/bin/bash
set -euo pipefail
[[ "$1" == exec && "$2" == komo-postgres && "$3" == sh && "$4" == -c ]]
# Run the container-side command with controlled container environment values.
bash -c "$5"
SH
cat > "$WORK/bin/pg_dump" <<'SH'
#!/bin/bash
set -euo pipefail
[[ "$#" == 3 && "$1" == -U && "$2" == "${POSTGRES_USER:-komo}" && "$3" == "${POSTGRES_DB:-komo}" ]]
case "${TEST_MODE:-success}" in
  failure) printf 'incomplete dump'; exit 42 ;;
  empty) exit 0 ;;
  success) cat "$FIXTURE" ;;
esac
SH
chmod +x "$WORK/bin/docker" "$WORK/bin/pg_dump"

for mode in custom defaults; do
  export BACKUP_DIR="$WORK/$mode"
  if [[ "$mode" == custom ]]; then
    export POSTGRES_USER='test user' POSTGRES_DB='test database'
  else
    unset POSTGRES_USER POSTGRES_DB
  fi
  bash "$SCRIPT"
  files=("$BACKUP_DIR"/*.sql.gz)
  [[ ${#files[@]} == 1 && -f "${files[0]}" ]]
  gzip -dc "${files[0]}" | cmp - "$FIXTURE"
done

for mode in failure empty; do
  export BACKUP_DIR="$WORK/$mode" TEST_MODE="$mode"
  mkdir -p "$BACKUP_DIR"
  printf 'previous backup' > "$BACKUP_DIR/previous.sql.gz"
  if bash "$SCRIPT"; then
    echo "Expected $mode to fail" >&2
    exit 1
  fi
  [[ $(cat "$BACKUP_DIR/previous.sql.gz") == 'previous backup' ]]
  [[ $(find "$BACKUP_DIR" -type f | wc -l) == 1 ]]
done
echo 'PASS: custom/default container config, dump failure, empty dump, previous backup preservation'
