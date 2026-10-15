#!/bin/bash
# CPU time while holding an arrow key (simulated key repeat), compared with an idle window
# in the same session. Scrolls down for the first half of the window and up for the second.
# usage: bench/scroll.sh [seconds=10] [keys per second=30] [torrent counts...=500 2000]
# Set NODE_ENV=production to measure with React's production build.
SECS=${1:-10}; RATE=${2:-30}; shift 2 || shift $# || true
COUNTS=${*:-500 2000}
BATCH_INTERVAL=0.1   # send keys in batches; one tmux call per keypress is too slow at high rates
PER_BATCH=$(( (RATE + 5) / 10 ))
BATCHES=$(echo "$SECS / $BATCH_INTERVAL" | bc)

for n in $COUNTS; do
    (   # subshell per run so lib.sh's cleanup trap fires after each one
        source "$(dirname "$0")/lib.sh"
        start "$n"

        before=$(cpu_seconds); sleep "$SECS"; after=$(cpu_seconds)
        idle=$(echo "$after - $before" | bc)

        before=$(cpu_seconds)
        for ((i = 0; i < BATCHES; i++)); do
            key=$([ $i -lt $((BATCHES / 2)) ] && echo Down || echo Up)
            tmux send-keys -t "$SESSION" $(printf "$key %.0s" $(seq $PER_BATCH))
            sleep "$BATCH_INTERVAL"
        done
        after=$(cpu_seconds)
        scrolling=$(echo "$after - $before" | bc)

        printf "%6s torrents: idle %5.2f CPU-s (%4.1f%%), scrolling at %s keys/s %5.2f CPU-s (%4.1f%%) over %ss\n" \
            "$n" "$idle" "$(echo "$idle * 100 / $SECS" | bc -l)" "$((PER_BATCH * 10))" \
            "$scrolling" "$(echo "$scrolling * 100 / $SECS" | bc -l)" "$SECS"
    )
done
