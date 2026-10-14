#!/bin/bash
# CPU time used by the TUI against a fake server, for each torrent count.
# usage: bench/cpu.sh [seconds=20] [torrent counts...=0 500 2000]
# Set NODE_ENV=production to measure with React's production build.
SECS=${1:-20}; shift || true
COUNTS=${*:-0 500 2000}
for n in $COUNTS; do
    (   # subshell per run so lib.sh's cleanup trap fires after each one
        source "$(dirname "$0")/lib.sh"
        start "$n"
        before=$(cpu_seconds); sleep "$SECS"; after=$(cpu_seconds)
        used=$(echo "$after - $before" | bc)
        rss=$(ps -o rss= -p "$TUI_PID" | tr -d ' ')
        printf "%6s torrents: %5.2f CPU-s over %ss (%4.1f%%), rss %s MB\n" \
            "$n" "$used" "$SECS" "$(echo "$used * 100 / $SECS" | bc -l)" "$((rss / 1024))"
    )
done
