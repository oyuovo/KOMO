#!/usr/bin/env bash
# Regression checks for the real readiness helper; no SSH, service or network access.
set -euo pipefail
SCRIPT=$(cd "$(dirname "$0")/.." && pwd)/backend-health.sh
WORK=$(mktemp -d)
trap 'rm -f -- "$WORK/count" "$WORK/max-time" "$WORK/"*.log; rmdir -- "$WORK"' EXIT
source "$SCRIPT"

date() { printf '%s\n' "$TEST_NOW"; }
sleep() { TEST_NOW=$((TEST_NOW + $1)); }
systemctl() {
  if [[ "$*" == *--value* ]]; then
    case "$MODE" in
      crashed) printf 'failed\n' ;;
      activating) if (( TEST_NOW < 4 )); then printf 'activating\n'; else printf 'active\n'; fi ;;
      *) printf 'active\n' ;;
    esac
  else
    printf 'ActiveState=fixture\nResult=fixture\n'
  fi
}
journalctl() { printf 'fixture startup log\n'; }
sudo() {
  [[ "$*" == '-n journalctl -u komo-backend -n 80 --no-pager' ]] || return 99
  if [[ "$MODE" == no_sudo ]]; then return 1; fi
  journalctl
}
curl() {
  [[ "$*" == *"--noproxy *"* && "$*" == *http://127.0.0.1:8081/api/health* ]] || return 99
  local previous='' arg
  for arg in "$@"; do
    if [[ "$previous" == --max-time ]]; then printf '%s' "$arg" > "$WORK/max-time"; fi
    previous=$arg
  done
  local calls
  calls=$(cat "$WORK/count"); calls=$((calls + 1)); printf '%s' "$calls" > "$WORK/count"
  case "$MODE" in
    delayed) if (( calls <= 3 )); then printf '000'; return 7; fi ;;
    probe_timeout) if (( calls <= 2 )); then printf '000'; return 28; fi ;;
    refused|no_sudo) printf '000'; return 7 ;;
    http_error) printf '503'; return 0 ;;
    redirect) printf '302'; return 0 ;;
  esac
  printf '200'
}

run_case() {
  MODE=$1; local expected=$2; TEST_NOW=0
  printf '0' > "$WORK/count"
  local result=0
  wait_for_backend 9 > "$WORK/$MODE.log" 2>&1 || result=$?
  if [[ "$expected" == success ]]; then
    [[ "$result" == 0 ]]
    grep -q 'backend http 200 (ready)' "$WORK/$MODE.log"
    ! grep -q 'Recent backend logs' "$WORK/$MODE.log"
  else
    [[ "$result" != 0 ]]
    grep -q 'ActiveState=fixture' "$WORK/$MODE.log"
    grep -q 'fixture startup log' "$WORK/$MODE.log"
    ! grep -q 'backend http 200 (ready)' "$WORK/$MODE.log"
  fi
  if [[ "$MODE" == delayed ]]; then [[ $(cat "$WORK/count") == 4 && "$TEST_NOW" == 6 ]]; fi
  if [[ "$MODE" == activating ]]; then [[ "$TEST_NOW" == 4 ]]; fi
  if [[ "$MODE" == crashed ]]; then [[ $(cat "$WORK/count") == 0 && "$TEST_NOW" == 0 ]]; fi
  case "$MODE" in
    refused|http_error|redirect|no_sudo)
      [[ "$TEST_NOW" == 9 && $(cat "$WORK/max-time") == 1 ]]
      grep -q 'did not become ready within 9s' "$WORK/$MODE.log"
      ;;
  esac
  printf 'PASS %s (%s)\n' "$MODE" "$expected"
}
run_case ready success
run_case delayed success
run_case activating success
run_case probe_timeout success
run_case refused failure
run_case http_error failure
run_case redirect failure
run_case crashed failure
run_case no_sudo failure
if wait_for_backend invalid > "$WORK/invalid.log" 2>&1; then exit 1; fi
printf 'PASS invalid timeout rejected\n'
printf 'RESULT: 10 readiness checks passed\n'
