#!/bin/bash
# Bytes the TUI writes to the terminal (a proxy for terminal-emulator CPU), and how many of
# those writes are full-screen clears.
# usage: bench/terminal-output.sh [torrents=500] [seconds=10]
source "$(dirname "$0")/lib.sh"
N=${1:-500}; SECS=${2:-10}
start "$N"
tmux pipe-pane -t "$SESSION" "cat > $WORK/out.bin"
sleep "$SECS"
tmux pipe-pane -t "$SESSION"
bytes=$(wc -c < "$WORK/out.bin" | tr -d ' ')
clears=$(grep -c $'\e\\[2J' "$WORK/out.bin" || true)
echo "$N torrents: $bytes bytes over ${SECS}s ($((bytes / SECS)) B/s), full-screen clears: $clears"
