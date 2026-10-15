#!/bin/bash
# CPU time while typing a search query (each keystroke re-filters and re-sorts), compared
# with an idle window in the same session. Types a query and then deletes it, repeatedly.
# usage: bench/search.sh [seconds=10] [keys per second=10] [torrent counts...=500 2000]
# Set NODE_ENV=production to measure with React's production build.
SECS=${1:-10}; RATE=${2:-10}; shift 2 || shift $# || true
COUNTS=${*:-500 2000}
QUERY="some linux distro 1"
KEYS=$((SECS * RATE))

for n in $COUNTS; do
    (   # subshell per run so lib.sh's cleanup trap fires after each one
        source "$(dirname "$0")/lib.sh"
        start "$n"
        tmux send-keys -t "$SESSION" /
        sleep 0.5

        before=$(cpu_seconds); sleep "$SECS"; after=$(cpu_seconds)
        idle=$(echo "$after - $before" | bc)

        # One key per tmux call: Ink reads keys that arrive in a single write as one keypress.
        before=$(cpu_seconds)
        start_time=$(date +%s.%N)
        typed=0
        for ((i = 0; i < KEYS; i++)); do
            if [ $typed -lt ${#QUERY} ] && [ $(( (i / ${#QUERY}) % 2 )) -eq 0 ]; then
                tmux send-keys -t "$SESSION" -l -- "${QUERY:typed:1}"; typed=$((typed + 1))
            else
                tmux send-keys -t "$SESSION" BSpace; typed=$((typed > 0 ? typed - 1 : 0))
            fi
            delay=$(echo "$start_time + ($i + 1) / $RATE - $(date +%s.%N)" | bc -l)
            [ "${delay:0:1}" != "-" ] && sleep "$delay"
        done
        after=$(cpu_seconds)
        elapsed=$(echo "$(date +%s.%N) - $start_time" | bc -l)
        typing=$(echo "$after - $before" | bc)

        printf "%6s torrents: idle %5.2f CPU-s (%4.1f%%), typing at %.0f keys/s %5.2f CPU-s (%4.1f%%) over %ss\n" \
            "$n" "$idle" "$(echo "$idle * 100 / $SECS" | bc -l)" "$(echo "$KEYS / $elapsed" | bc -l)" \
            "$typing" "$(echo "$typing * 100 / $elapsed" | bc -l)" "$SECS"
    )
done
