# Shared setup for the bench scripts. Source it; then call start <torrents> [extra node args...].
# Starts the fake server and the TUI (in a detached 200x50 tmux session) and cleans both up on exit.
# Set QBT_MAIN to benchmark a different build (default: dist/main.js).
# Sets: BENCH_DIR, ROOT, SESSION, WORK (scratch dir), TUI_PID.
set -euo pipefail
BENCH_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(dirname "$BENCH_DIR")
MAIN=${QBT_MAIN:-$ROOT/dist/main.js}
PORT=$((20000 + RANDOM % 10000))
SESSION="qbt-bench-$PORT"
WORK="$BENCH_DIR/tmp/$PORT"   # inside the project so the mise node shim resolves
SERVER_PID=""

cleanup() {
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; fi || true
    rm -rf "$WORK"
}
trap cleanup EXIT

start() {
    local torrents=$1; shift
    [ -f "$MAIN" ] || { echo "$MAIN not found; run npm run build" >&2; exit 1; }
    mkdir -p "$WORK"
    printf '[connection]\nurl = "http://localhost:%s"\nusername = "bench"\npassword = "bench"\n' "$PORT" > "$WORK/config.toml"
    node "$BENCH_DIR/fake-qbt.mjs" "$torrents" "$PORT" & SERVER_PID=$!
    sleep 0.5
    tmux new-session -d -s "$SESSION" -x 200 -y 50 -c "$WORK" \
        "NODE_ENV=${NODE_ENV:-} node $* $MAIN"
    TUI_PID=$(tmux list-panes -t "$SESSION" -F '#{pane_pid}')
    sleep 3   # let it log in and process the initial full update
}

# CPU time (seconds) consumed so far by TUI_PID.
cpu_seconds() {
    ps -o time= -p "$TUI_PID" | awk -F'[:.]' '{ printf "%.2f", $1 * 60 + $2 + $3 / 100 }'
}
