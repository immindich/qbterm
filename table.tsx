import { useState, useRef, memo, useMemo } from "react";
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
    render: (torrent: TorrentInfo, rawStatus: boolean) => string;
    sort: ((a: TorrentInfo, b: TorrentInfo) => number) | null;
}

const columns: Column[] = [
    { name: "Name", key: "name", width: 20, render: (t) => stateIcon(t.state) + " " + t.name, sort: (a, b) => a.name.localeCompare(b.name) },
    { name: "Size", key: "size", width: 7, render: (t) => formatBytes(t.size), sort: null },
    { name: "Progress", key: "progress", width: 8, render: (t) => formatProgress(t.progress), sort: null },
    { name: "Status", key: "state", width: { min: 11 }, render: (t, rawStatus) => rawStatus ? t.state : stateText(t.state), sort: null },
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

export const columnCount = columns.length;

function resolveWidths(torrents: TorrentInfo[], rawStatus: boolean): number[] {
    return columns.map((col) => {
        if (typeof col.width === "number") return col.width;
        let max = col.width.min;
        for (const t of torrents) {
            const len = col.render(t, rawStatus).length;
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
    rawStatus: boolean;
}

const TableRow = memo(function TableRow({ torrent, selected, scrollX, screenWidth, widths, rawStatus }: TableRowProps) {
    const line = columns.map((col, i) => padOrTruncate(col.render(torrent, rawStatus), widths[i])).join(" ");
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
    let pos = 0;  // position in the full header line
    let used = 0; // screen columns already filled
    columns.forEach((col, i) => {
        const label = col.name + (i === sort_column ? (sort_ascending ? " ▲" : " ▼") : "");
        const cell = padOrTruncate(label, widths[i]);
        const separator = i < columns.length - 1 ? " " : "";
        const chunk = cell + separator;
        const visible = viewSlice(chunk, Math.max(0, scrollX - pos), screenWidth - used);
        pos += chunk.length;
        used += visible.length;
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

export function sortTorrents(torrents: TorrentInfo[], sort_column: number, sort_ascending: boolean): TorrentInfo[] {
    const col = columns[sort_column];
    const dir = sort_ascending ? 1 : -1;
    const compare = col.sort ?? ((a: TorrentInfo, b: TorrentInfo) => (a[col.key] as number) - (b[col.key] as number));
    return [...torrents].sort((a, b) => compare(a, b) * dir);
}

// Index of the selected torrent in the sorted list; falls back to the first row if it's gone
export function findSelectedIndex(sorted: TorrentInfo[], selected: string | null): number {
    const idx = selected === null ? -1 : sorted.findIndex((t) => t.hash === selected);
    return idx === -1 ? 0 : idx;
}

export interface TableProps {
    sorted: TorrentInfo[];
    // Column widths are sized to fit these (all torrents, not just the filtered ones,
    // so columns don't shift while a search is typed)
    widthTorrents: TorrentInfo[];
    selectedIndex: number;
    sortColumn: number;
    sortAscending: boolean;
    sorting: boolean;
    maxRows: number;
    screenWidth: number;
    rawStatus: boolean;
    // While a text input is focused, leave ←→ and Home/End to it
    textInputActive: boolean;
    emptyMessage?: string;
    onSelectionChange: (hash: string) => void;
}

export function Table({ sorted, widthTorrents, selectedIndex, sortColumn, sortAscending, sorting, maxRows, screenWidth, rawStatus, textInputActive, emptyMessage, onSelectionChange }: TableProps) {
    const scrollOffsetRef = useRef(0);
    const [scrollX, setScrollX] = useState(0);

    const widths = useMemo(() => resolveWidths(widthTorrents, rawStatus), [widthTorrents, rawStatus]);
    const tableWidth = useMemo(() => computeTableWidth(widths), [widths]);

    const selectedHash = sorted[selectedIndex]?.hash ?? null;

    useInput((_input, key) => {
        // Horizontal scroll
        const scrollXDelta = textInputActive ? 0 : key.rightArrow ? 4 : key.leftArrow ? -4 : 0;
        if (scrollXDelta !== 0) {
            setScrollX((prev) => {
                const maxScrollX = Math.max(0, tableWidth - screenWidth);
                return Math.max(0, Math.min(maxScrollX, prev + scrollXDelta));
            });
        }

        // Navigation
        const delta = key.upArrow ? -1 : key.downArrow ? 1 : key.pageUp ? -maxRows : key.pageDown ? maxRows
            : textInputActive ? 0 : key.home ? -Infinity : key.end ? Infinity : 0;
        if (delta !== 0) {
            const len = sorted.length;
            if (len === 0) return;
            const newIndex = Math.max(0, Math.min(len - 1, selectedIndex + delta));
            onSelectionChange(sorted[newIndex].hash);
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
            {visible.length === 0 && emptyMessage && <Text dimColor>{emptyMessage}</Text>}
            {visible.map((torrent) => <TableRow torrent={torrent} key={torrent.hash} selected={torrent.hash === selectedHash} scrollX={scrollX} screenWidth={screenWidth} widths={widths} rawStatus={rawStatus} />)}
        </Box>
    )
}
