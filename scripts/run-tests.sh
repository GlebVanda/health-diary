#!/usr/bin/env bash
# Запускает браузерные тесты в безголовом Chrome/Edge и выводит результат.
# Использование: scripts/run-tests.sh [путь_к_браузеру]. Код выхода 0 — все тесты прошли.
set -euo pipefail
cd "$(dirname "$0")/.."
BROWSER="${1:-${CHROME_BIN:-}}"
if [ -z "$BROWSER" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome msedge; do
    if command -v "$c" >/dev/null 2>&1; then BROWSER="$c"; break; fi
  done
fi
[ -n "$BROWSER" ] || { echo "Не найден Chrome/Chromium/Edge: укажите путь аргументом или в CHROME_BIN"; exit 2; }
PORT="${PORT:-8123}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
OUT=$("$BROWSER" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=40000 --dump-dom "http://127.0.0.1:$PORT/tests/index.html" 2>/dev/null || true)
TITLE=$(printf '%s' "$OUT" | grep -o '<title>[^<]*</title>' | head -1 | sed 's/<[^>]*>//g')
echo "Результат: ${TITLE:-нет ответа}"
printf '%s' "$OUT" | grep -o 'class="fail">[^<]*' | sed 's/class="fail">/  ПАДЕНИЕ: /' || true
case "$TITLE" in "✓"*) exit 0 ;; *) exit 1 ;; esac
