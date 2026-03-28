import { useState, useRef, useEffect, memo, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { TorrentInfo } from "./api.js";
import { formatBytes, formatProgress, formatDuration, stateIcon, stateText } from "./format.js";

function padOrTruncate(str: string, width: number): string {
    if (str.length > width) return str.slice(0, width);
    return str.padEnd(width);
}

interface Column {
    name: string;
    key: keyof TorrentInfo;
    width: number | { min: number };
    render: (torrent: TorrentInfo) => string;
    sort: ((a: TorrentInfo, b: TorrentInfo) => number) | null;
}

let rawStatus = false;

const columns: Column[] = [
    { name: "Name", key: "name", width: 20, render: (t) => stateIcon(t.state) + " " + t.name, sort: (a, b) => a.name.localeCompare(b.name) },
    { name: "Size", key: "size", width: 7, render: (t) => formatBytes(t.size), sort: null },
    { name: "Progress", key: "progress", width: 8, render: (t) => formatProgress(t.progress), sort: null },
    { name: "Status", key: "state", width: { min: 11 }, render: (t) => rawStatus ? t.state : stateText(t.state), sort: null },
    { name: "Down", key: "dlspeed", width: 9, render: (t) => formatBytes(t.dlspeed) + "/s", sort: null },
    { name: "Up", key: "upspeed", width: 9, render: (t) => formatBytes(t.upspeed) + "/s", sort: null },
    { name: "Seeds", key: "num_seeds", width: 5, render: (t) => t.num_seeds.toString(), sort: null },
    { name: "Peers", key: "num_leechs", width: 5, render: (t) => t.num_leechs.toString(), sort: null },
    { name: "Ratio", key: "ratio", width: 5, render: (t) => t.ratio.toFixed(2), sort: null },
    { name: "ETA", key: "eta", width: 5, render: (t) => {
        switch (t.state) {
            case "downloading":
            case "forcedDL":
            case "metaDL":
            case "forcedMetaDL":
                return formatDuration(t.eta);
            default:
                return "";
        }
    }, sort: null },
];

export function setRawStatus(value: boolean) {
    rawStatus = value;
}

function resolveWidths(torrents: TorrentInfo[]): number[] {
    return columns.map((col) => {
        if (typeof col.width === "number") return col.width;
        let max = col.width.min;
        for (const t of torrents) {
            const len = col.render(t).length;
            if (len > max) max = len;
        }
        return Math.max(max, col.name.length + 2); // +2 for sort indicator
    });
}

function computeTableWidth(widths: number[]): number {
    return widths.reduce((sum, w) => sum + w, 0) + (columns.length - 1);
}

function viewSlice(line: string, scrollX: number, screenWidth: number): string {
    return line.slice(scrollX, scrollX + screenWidth);
}

interface TableRowProps {
    torrent: TorrentInfo;
    selected: boolean;
    scrollX: number;
    screenWidth: number;
    widths: number[];
}

const TableRow = memo(function TableRow({ torrent, selected, scrollX, screenWidth, widths }: TableRowProps) {
    const line = columns.map((col, i) => padOrTruncate(col.render(torrent), widths[i])).join(" ");
    return <Text inverse={selected}>{viewSlice(line, scrollX, screenWidth)}</Text>;
});

interface TableHeaderProps {
    sort_column: number;
    sort_ascending: boolean;
    sorting: boolean;
    scrollX: number;
    screenWidth: number;
    widths: number[];
}

function TableHeader({ sort_column, sort_ascending, sorting, scrollX, screenWidth, widths }: TableHeaderProps) {
    const line = columns.map((col, i) => {
        const label = col.name + (i === sort_column ? (sort_ascending ? " ▲" : " ▼") : "");
        return padOrTruncate(label, widths[i]);
    }).join(" ");

    if (!sorting) {
        return <Text bold>{viewSlice(line, scrollX, screenWidth)}</Text>;
    }

    // In sorting mode, highlight the active column
    const parts: { text: string; active: boolean }[] = [];
    let pos = 0;
    columns.forEach((col, i) => {
        const label = col.name + (i === sort_column ? (sort_ascending ? " ▲" : " ▼") : "");
        const cell = padOrTruncate(label, widths[i]);
        const separator = i < columns.length - 1 ? " " : "";
        const chunk = cell + separator;
        const visible = viewSlice(chunk, Math.max(0, scrollX - pos), screenWidth);
        pos += chunk.length;
        if (visible.length > 0) {
            parts.push({ text: visible, active: i === sort_column });
        }
    });

    return (
        <Text bold>
            {parts.map((p, i) =>
                p.active ? <Text key={i} inverse>{p.text}</Text> : <Text key={i}>{p.text}</Text>
            )}
        </Text>
    );
}

function sortTorrents(torrents: Record<string, TorrentInfo>, sort_column: number, sort_ascending: boolean): TorrentInfo[] {
    const col = columns[sort_column];
    const dir = sort_ascending ? 1 : -1;
    const compare = col.sort ?? ((a: TorrentInfo, b: TorrentInfo) => (a[col.key] as number) - (b[col.key] as number));
    return Object.values(torrents).sort((a, b) => compare(a, b) * dir);
}

export interface TableProps {
    torrents: Record<string, TorrentInfo>;
    sorting: boolean;
    maxRows: number;
    screenWidth: number;
    onSelectionChange: (hash: string | null) => void;
}

export function Table({ torrents, sorting, maxRows, screenWidth, onSelectionChange }: TableProps) {
    const scrollOffsetRef = useRef(0);
    const [scrollX, setScrollX] = useState(0);
    const [sortColumn, setSortColumn] = useState(0);
    const [sortAscending, setSortAscending] = useState(true);
    const [selectedTorrent, setSelectedTorrent] = useState<string | null>(null);

    const sorted = useMemo(() => sortTorrents(torrents, sortColumn, sortAscending), [torrents, sortColumn, sortAscending]);
    const widths = useMemo(() => resolveWidths(sorted), [sorted]);
    const tableWidth = useMemo(() => computeTableWidth(widths), [widths]);

    // Preserve selection when data changes; fall back to first item if selected was removed
    const selectedIndex = useMemo(() => {
        if (selectedTorrent !== null && torrents[selectedTorrent] !== undefined) {
            const idx = sorted.findIndex((t) => t.hash === selectedTorrent);
            if (idx !== -1) return idx;
        }
        return 0;
    }, [sorted, selectedTorrent, torrents]);

    const effectiveHash = sorted[selectedIndex]?.hash ?? null;

    useEffect(() => {
        if (effectiveHash !== selectedTorrent) {
            setSelectedTorrent(effectiveHash);
        }
    }, [effectiveHash, selectedTorrent]);

    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;

    useEffect(() => {
        onSelectionChangeRef.current(effectiveHash);
    }, [effectiveHash]);

    useInput((input, key) => {
        // Horizontal scroll
        const scrollXDelta = key.rightArrow ? 4 : key.leftArrow ? -4 : 0;
        if (scrollXDelta !== 0) {
            setScrollX((prev) => {
                const maxScrollX = Math.max(0, tableWidth - screenWidth);
                return Math.max(0, Math.min(maxScrollX, prev + scrollXDelta));
            });
        }

        // Navigation
        const delta = key.upArrow ? -1 : key.downArrow ? 1 : key.pageUp ? -maxRows : key.pageDown ? maxRows : key.home ? -Infinity : key.end ? Infinity : 0;
        if (delta !== 0) {
            const len = sorted.length;
            if (len === 0) return;
            const newIndex = Math.max(0, Math.min(len - 1, selectedIndex + delta));
            const newHash = sorted[newIndex].hash;
            setSelectedTorrent(newHash);
            onSelectionChangeRef.current(newHash);
        }

        // Sort mode controls
        if (sorting) {
            if (key.tab) {
                const dir = key.shift ? -1 : 1;
                setSortColumn((prev) => (prev + dir + columns.length) % columns.length);
            }
            if (input === " ") {
                setSortAscending((prev) => !prev);
            }
        }
    });

    // Keep selection in view
    const maxScrollOffset = Math.max(0, sorted.length - maxRows);
    if (scrollOffsetRef.current > maxScrollOffset) {
        scrollOffsetRef.current = maxScrollOffset;
    }
    if (selectedIndex < scrollOffsetRef.current) {
        scrollOffsetRef.current = selectedIndex;
    } else if (selectedIndex >= scrollOffsetRef.current + maxRows) {
        scrollOffsetRef.current = selectedIndex - maxRows + 1;
    }

    const scrollOffset = scrollOffsetRef.current;
    const visible = maxRows > 0 ? sorted.slice(scrollOffset, scrollOffset + maxRows) : sorted;

    return (
        <Box flexDirection="column">
            <TableHeader sort_column={sortColumn} sort_ascending={sortAscending} sorting={sorting} scrollX={scrollX} screenWidth={screenWidth} widths={widths} />
            <Text>{"─".repeat(screenWidth)}</Text>
            {visible.map((torrent) => <TableRow torrent={torrent} key={torrent.hash} selected={torrent.hash === effectiveHash} scrollX={scrollX} screenWidth={screenWidth} widths={widths} />)}
        </Box>
    )
}
