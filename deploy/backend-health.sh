#!/bin/sh
# Sourced into the remote SSH command; loading this file performs no deployment.
backend_health_diagnostics() {
  printf '\nBackend readiness failed. Service state:\n' >&2
  systemctl show komo-backend --no-pager \
    -p ActiveState -p SubState -p Result -p ExecMainStatus -p NRestarts >&2 || true
  printf '\nRecent backend logs:\n' >&2
  # Never prompt for another sudo password while reporting a failed deployment.
  if ! sudo -n journalctl -u komo-backend -n 80 --no-pager >&2; then
    journalctl -u komo-backend -n 80 --no-pager >&2 || true
  fi
}

wait_for_backend() {
  backend_timeout=${1:-120}
  case "$backend_timeout" in
    ''|*[!0-9]*) printf 'Invalid backend readiness timeout.\n' >&2; return 1 ;;
  esac
  if [ "$backend_timeout" -le 0 ]; then
    printf 'Backend readiness timeout must be positive.\n' >&2
    return 1
  fi
  backend_started=$(date +%s)
  backend_deadline=$((backend_started + backend_timeout))
  backend_http=000
  backend_curl_exit=0
  printf 'Waiting up to %ss for komo-backend HTTP readiness...\n' "$backend_timeout"

  while :; do
    backend_now=$(date +%s)
    backend_remaining=$((backend_deadline - backend_now))
    if [ "$backend_remaining" -le 0 ]; then break; fi
    if backend_state=$(systemctl show komo-backend -p ActiveState --value); then :; else
      printf 'Cannot read komo-backend service state.\n' >&2
      backend_health_diagnostics
      return 1
    fi
    case "$backend_state" in
      failed|inactive)
        printf 'komo-backend became %s before HTTP readiness.\n' "$backend_state" >&2
        backend_health_diagnostics
        return 1
        ;;
    esac
    backend_probe_timeout=5
    if [ "$backend_remaining" -lt 5 ]; then backend_probe_timeout=$backend_remaining; fi
    backend_curl_exit=0
    # Use the unit's IPv4 loopback address and bypass proxy environment variables.
    if backend_http=$(curl --noproxy '*' --connect-timeout 2 --max-time "$backend_probe_timeout" \
        -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/health); then :; else
      backend_curl_exit=$?
    fi
    if [ "$backend_curl_exit" -eq 0 ] && [ "$backend_http" = 200 ] && [ "$backend_state" = active ]; then
      printf 'backend http 200 (ready)\n'
      return 0
    fi
    printf 'Backend not ready: service=%s HTTP=%s curl_exit=%s; retrying...\n' \
      "$backend_state" "$backend_http" "$backend_curl_exit"
    backend_remaining=$((backend_deadline - $(date +%s)))
    if [ "$backend_remaining" -le 0 ]; then break; fi
    backend_delay=2
    if [ "$backend_remaining" -lt 2 ]; then backend_delay=$backend_remaining; fi
    sleep "$backend_delay"
  done

  printf 'Backend did not become ready within %ss (last HTTP=%s, curl_exit=%s).\n' \
    "$backend_timeout" "$backend_http" "$backend_curl_exit" >&2
  backend_health_diagnostics
  return 1
}
