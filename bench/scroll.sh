#!/bin/bash
# CPU time while holding an arrow key (simulated key repeat), compared with an idle window
# in the same session. Scrolls down for the first half of the window and up for the second.
# usage: bench/scroll.sh [seconds=10] [keys per second=30] [torrent counts...=500 2000]
# Set NODE_ENV=production to measure with React's production build.
SECS=${1:-10}; RATE=${2:-30}; shift 2 || shift $# || true
COUNTS=${*:-500 2000}
# One key per tmux call: Ink reads escape sequences that arrive in a single write as one keypress.
KEYS=$((SECS * RATE))

for n in $COUNTS; do
    (   # subshell per run so lib.sh's cleanup trap fires after each one
        source "$(dirname "$0")/lib.sh"
        start "$n"

        before=$(cpu_seconds); sleep "$SECS"; after=$(cpu_seconds)
        idle=$(echo "$after - $before" | bc)

        before=$(cpu_seconds)
        start_time=$(date +%s.%N)
        for ((i = 0; i < KEYS; i++)); do
            key=$([ $i -lt $((KEYS / 2)) ] && echo Down || echo Up)
            tmux send-keys -t "$SESSION" "$key"
            # sleep until this key's scheduled time, so tmux overhead doesn't lower the rate
            delay=$(echo "$start_time + ($i + 1) / $RATE - $(date +%s.%N)" | bc -l)
            [ "${delay:0:1}" != "-" ] && sleep "$delay"
        done
        after=$(cpu_seconds)
        elapsed=$(echo "$(date +%s.%N) - $start_time" | bc -l)
        scrolling=$(echo "$after - $before" | bc)

        printf "%6s torrents: idle %5.2f CPU-s (%4.1f%%), scrolling at %.0f keys/s %5.2f CPU-s (%4.1f%%) over %ss\n" \
            "$n" "$idle" "$(echo "$idle * 100 / $SECS" | bc -l)" "$(echo "$KEYS / $elapsed" | bc -l)" \
            "$scrolling" "$(echo "$scrolling * 100 / $elapsed" | bc -l)" "$SECS"
    )
done
