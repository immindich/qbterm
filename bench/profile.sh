#!/bin/bash
# CPU-profile the TUI against a fake server and print the hottest functions.
# usage: bench/profile.sh [torrents=2000] [seconds=20]
# The raw .cpuprofile is kept in bench/profiles/ (open it in Chrome DevTools for a flame graph).
source "$(dirname "$0")/lib.sh"
N=${1:-2000}; SECS=${2:-20}
OUT="$BENCH_DIR/profiles/$(date +%Y%m%d-%H%M%S)-$N"
mkdir -p "$OUT"
start "$N" --cpu-prof --cpu-prof-dir="$OUT"
sleep "$SECS"
tmux send-keys -t "$SESSION" q   # clean exit so node writes the profile
for _ in $(seq 20); do ls "$OUT"/*.cpuprofile >/dev/null 2>&1 && break; sleep 0.5; done
node "$BENCH_DIR/summarize-profile.mjs" "$OUT"/*.cpuprofile
echo "profile: $OUT"
