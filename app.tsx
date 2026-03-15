import { useState, useEffect, useRef, memo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { getMainData, addTorrents, TransferInfo, type TorrentInfo } from "./api.js";
import { Form } from "./form.js";

function useTerminalSize() {
    const { stdout } = useStdout();
    const [size, setSize] = useState({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 });

    useEffect(() => {
        const onResize = () => setSize({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
        stdout.on("resize", onResize);
        return () => { stdout.off("resize", onResize); };
    }, [stdout]);

    return size;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, index)).toFixed(1) + " " + units[index];
}

function formatProgress(progress: number): string {
    return (progress * 100).toFixed(2) + "%";
}

function padOrTruncate(str: string, width: number): string {
    if (str.length > width) return str.slice(0, width);
    return str.padEnd(width);
}

interface Column {
    name: string;
    key: keyof TorrentInfo;
    width: number;
    render: (torrent: TorrentInfo) => string;
    sort: ((a: TorrentInfo, b: TorrentInfo) => number) | null;
}

const columns: Column[] = [
    { name: "Name", key: "name", width: 20, render: (t) => t.name, sort: (a, b) => a.name.localeCompare(b.name) },
    { name: "Size", key: "size", width: 10, render: (t) => formatBytes(t.size), sort: null },
    { name: "Progress", key: "progress", width: 10, render: (t) => formatProgress(t.progress), sort: null },
    { name: "Status", key: "state", width: 10, render: (t) => t.state, sort: null },
    { name: "Down Speed", key: "dlspeed", width: 12, render: (t) => formatBytes(t.dlspeed) + "/s", sort: null },
    { name: "Up Speed", key: "upspeed", width: 10, render: (t) => formatBytes(t.upspeed) + "/s", sort: null },
];

function viewSlice(line: string, scrollX: number, screenWidth: number): string {
    return line.slice(scrollX, scrollX + screenWidth);
}

interface TableRowProps {
    torrent: TorrentInfo;
    selected: boolean;
    scrollX: number;
    screenWidth: number;
}

const TableRow = memo(function TableRow({ torrent, selected, scrollX, screenWidth }: TableRowProps) {
    const line = "  " + columns.map((col) => padOrTruncate(col.render(torrent), col.width)).join(" ");
    return <Text inverse={selected}>{viewSlice(line, scrollX, screenWidth)}</Text>;
});

interface TableHeaderProps {
    sort_column: number;
    sort_ascending: boolean;
    sorting: boolean;
    scrollX: number;
    screenWidth: number;
}

function TableHeader({ sort_column, sort_ascending, sorting, scrollX, screenWidth }: TableHeaderProps) {
    const line = "  " + columns.map((col, i) => {
        const label = col.name + (i === sort_column ? (sort_ascending ? " ▲" : " ▼") : "");
        return padOrTruncate(label, col.width);
    }).join(" ");

    if (!sorting) {
        return <Text bold>{viewSlice(line, scrollX, screenWidth)}</Text>;
    }

    // In sorting mode, highlight the active column
    const parts: { text: string; active: boolean }[] = [];
    let pos = 2; // leading "  "
    parts.push({ text: viewSlice("  ", scrollX, screenWidth), active: false });
    columns.forEach((col, i) => {
        const label = col.name + (i === sort_column ? (sort_ascending ? " ▲" : " ▼") : "");
        const cell = padOrTruncate(label, col.width);
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

interface StatusBarProps {
    dl_info_speed: number;
    dl_info_data: number;
    up_info_speed: number;
    up_info_data: number;
    screenWidth: number;
}

function StatusBar({ dl_info_speed, dl_info_data, up_info_speed, up_info_data, screenWidth }: StatusBarProps) {
    const line = `Download Speed: ${formatBytes(dl_info_speed)}/s  Upload Speed: ${formatBytes(up_info_speed)}/s`;
    return <Text>{line.slice(0, screenWidth)}</Text>;
}

function HelpBar({ keys }: { keys: [string, string][] }) {
    return (
        <Text>
            {keys.map(([key, desc], i) => (
                <Text key={i}>{i > 0 ? "  " : ""}<Text bold>{key}</Text> {desc}</Text>
            ))}
        </Text>
    );
}

const tableWidth = 2 + columns.reduce((sum, col) => sum + col.width, 0) + (columns.length - 1);

interface TableProps {
    torrents: TorrentInfo[];
    selected_torrent: string | null;
    scrollOffset: number;
    scrollX: number;
    maxRows: number;
    sort_column: number;
    sort_ascending: boolean;
    sorting: boolean;
    screenWidth: number;
}

function Table({ torrents, selected_torrent, scrollOffset, scrollX, maxRows, sort_column, sort_ascending, sorting, screenWidth }: TableProps) {
    const visible = maxRows > 0 ? torrents.slice(scrollOffset, scrollOffset + maxRows) : torrents;

    return (
        <Box flexDirection="column">
            <TableHeader sort_column={sort_column} sort_ascending={sort_ascending} sorting={sorting} scrollX={scrollX} screenWidth={screenWidth} />
            <Text>{"─".repeat(screenWidth)}</Text>
            {visible.map((torrent) => <TableRow torrent={torrent} key={torrent.hash} selected={torrent.hash === selected_torrent} scrollX={scrollX} screenWidth={screenWidth} />)}
        </Box>
    )
}

interface AddTorrentFormProps {
    serverUrl: string;
    sid: string;
    defaultSavePath: string;
    onClose: () => void;
}

function AddTorrentForm({ serverUrl, sid, defaultSavePath, onClose }: AddTorrentFormProps) {
    const [url, setUrl] = useState("");
    const [savePath, setSavePath] = useState(defaultSavePath);
    const [startPaused, setStartPaused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        if (loading || !url.trim()) return;
        setLoading(true);
        setError(null);
        addTorrents(serverUrl, sid, { urls: [url.trim()], savepath: savePath, stopped: startPaused })
            .then(() => onClose())
            .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            });
    }

    return (
        <>
            <Form
                title="Add new torrent"
                fields={[
                    { label: "URL", value: url, onChange: setUrl },
                    { label: "Save path", value: savePath, onChange: setSavePath },
                    { label: "Start paused", type: "checkbox", value: startPaused, onChange: setStartPaused }
                ]}
                onSubmit={handleSubmit}
            />
            {loading && <Text color="yellow">Adding torrent...</Text>}
            {error && <Text color="red">{error}</Text>}
        </>
    );
}

function resortState(prev: TorrentState, overrides: Partial<Pick<TorrentState, "torrents" | "sort_column" | "sort_ascending">> = {}): TorrentState {
    const torrents = overrides.torrents ?? prev.torrents;
    const sort_column = overrides.sort_column ?? prev.sort_column;
    const sort_ascending = overrides.sort_ascending ?? prev.sort_ascending;

    const col = columns[sort_column];
    const dir = sort_ascending ? 1 : -1;
    const compare = col.sort ?? ((a: TorrentInfo, b: TorrentInfo) => (a[col.key] as number) - (b[col.key] as number));
    const torrents_sorted = Object.values(torrents).sort((a, b) => compare(a, b) * dir);

    const still_exists = prev.selected_torrent !== null && torrents[prev.selected_torrent] !== undefined;
    const selected_torrent = still_exists ? prev.selected_torrent : (torrents_sorted[0]?.hash ?? null);
    const selected_torrent_index = selected_torrent
        ? torrents_sorted.findIndex((t) => t.hash === selected_torrent)
        : 0;

    return { torrents, torrents_sorted, selected_torrent, selected_torrent_index, sort_column, sort_ascending, server_state: prev.server_state };
}

interface TorrentState {
    torrents: Record<string, TorrentInfo>;
    torrents_sorted: TorrentInfo[];
    selected_torrent: string | null;
    selected_torrent_index: number;
    sort_column: number;
    sort_ascending: boolean;
    server_state: TransferInfo;
}

type Mode = "normal" | "sorting" | "add-torrent";

interface AppProps {
    url: string;
    sid: string;
    defaultSavePath: string;
}

export function App({ url, sid, defaultSavePath }: AppProps) {
    const [state, setState] = useState<TorrentState | null>(null);
    const [mode, setMode] = useState<Mode>("normal");
    const ridRef = useRef(0);
    const scrollOffsetRef = useRef(0);
    const scrollXRef = useRef(0);
    const { columns: screenWidth, rows: screenRows } = useTerminalSize();
    const maxRows = screenRows - 5;

    const { exit } = useApp();

    useInput((input, key) => {
        if (mode === "normal") {
            if (input === "q") {
                exit();
            }

            const isPage = key.pageUp || key.pageDown;
            const delta = key.upArrow ? -1 : key.downArrow ? 1 : key.pageUp ? -maxRows : key.pageDown ? maxRows : key.home ? -Infinity : key.end ? Infinity : 0;
            if (delta !== 0) {
                setState((prev) => {
                    if (prev === null || prev.torrents_sorted.length === 0) {
                        return prev;
                    }

                    const len = prev.torrents_sorted.length;
                    const new_index = Math.max(0, Math.min(len - 1, prev.selected_torrent_index + delta));

                    if (isPage) {
                        scrollOffsetRef.current = Math.max(0, Math.min(len - maxRows, scrollOffsetRef.current + delta));
                    } else if (new_index < scrollOffsetRef.current) {
                        scrollOffsetRef.current = new_index;
                    } else if (new_index >= scrollOffsetRef.current + maxRows) {
                        scrollOffsetRef.current = new_index - maxRows + 1;
                    }

                    return { ...prev, selected_torrent_index: new_index, selected_torrent: prev.torrents_sorted[new_index].hash };
                });
            }

            const scrollXDelta = key.rightArrow ? 4 : key.leftArrow ? -4 : 0;
            if (scrollXDelta !== 0) {
                const maxScrollX = Math.max(0, tableWidth - screenWidth);
                scrollXRef.current = Math.max(0, Math.min(maxScrollX, scrollXRef.current + scrollXDelta));
                setState((prev) => prev && { ...prev });
            }

            if (input === "s") {
                setMode("sorting");
            }

            if (input === "t") {
                setMode("add-torrent");
            }
        } else if (mode === "add-torrent") {
            if (key.escape) {
                setMode("normal");
            }
        } else if (mode === "sorting") {
            if (key.escape) {
                setMode("normal");
            }

            if (key.tab) {
                const dir = key.shift ? -1 : 1;
                setState((prev) => {
                    if (prev === null) return prev;
                    const new_col = (prev.sort_column + dir + columns.length) % columns.length;
                    return resortState(prev, { sort_column: new_col });
                });
            }

            if (input === " ") {
                setState((prev) => {
                    if (prev === null) return prev;
                    return resortState(prev, { sort_ascending: !prev.sort_ascending });
                });
            }
        }
    });

    useEffect(() => {
        async function fetchData() {
            const data = await getMainData(url, sid, ridRef.current);
            ridRef.current = data.rid;

            setState((prev) => {
                let torrents = prev?.torrents ?? {};

                if (data.full_update) {
                    torrents = {};
                }

                if (data.torrents) {
                    for (const [hash, partial] of Object.entries(data.torrents)) {
                        torrents = { ...torrents, [hash]: { ...torrents[hash], ...partial, hash } as TorrentInfo };
                    }
                }

                if (data.torrents_removed) {
                    torrents = { ...torrents };
                    for (const hash of data.torrents_removed) {
                        delete torrents[hash];
                    }
                }

                const default_server_state: TransferInfo = {
                    dl_info_speed: 0,
                    dl_info_data: 0,
                    up_info_speed: 0,
                    up_info_data: 0,
                    dl_rate_limit: 0,
                    up_rate_limit: 0,
                    dht_nodes: 0,
                    connection_status: "disconnected",
                    queueing: false,
                    use_alt_speed_limits: false,
                    refresh_interval: 1000,
                };

                const server_state: TransferInfo = {
                    ...(prev?.server_state ?? default_server_state),
                    ...data.server_state,
                };

                const base: TorrentState = prev ?? {
                    torrents,
                    torrents_sorted: [],
                    selected_torrent: null,
                    selected_torrent_index: 0,
                    sort_column: 0,
                    sort_ascending: true,
                    server_state,
                };

                return { ...resortState(base, { torrents }), server_state };
            });
        }

        fetchData();
        const interval = setInterval(fetchData, 1000);
        return () => clearInterval(interval);
    }, [url, sid]);

    if (state === null) {
        return <Box width="100%" height="100%"><Text>Loading...</Text></Box>;
    }

    const maxScrollOffset = Math.max(0, state.torrents_sorted.length - maxRows);
    if (scrollOffsetRef.current > maxScrollOffset) {
        scrollOffsetRef.current = maxScrollOffset;
    }

    const helpKeys: [string, string][] = mode === "sorting"
        ? [["Tab", "column"], ["Space", "toggle order"], ["Esc", "done"]]
        : mode === "add-torrent"
        ? [["Tab", "switch field"], ["Esc", "close"]]
        : [["↑↓", "navigate"], ["←→", "scroll"], ["PgUp/PgDn", "page"], ["Home/End", "jump"], ["s", "sort"], ["t", "add torrent"], ["q", "quit"]];

    return (
        <Box width={screenWidth} height={screenRows} flexDirection="column">
            <Box flexGrow={1} flexDirection="column">
                {mode === "add-torrent"
                    ? <AddTorrentForm serverUrl={url} sid={sid} defaultSavePath={defaultSavePath} onClose={() => setMode("normal")} />
                    : <Table torrents={state.torrents_sorted} selected_torrent={state.selected_torrent} scrollOffset={scrollOffsetRef.current} scrollX={scrollXRef.current} sort_column={state.sort_column} sort_ascending={state.sort_ascending} sorting={mode === "sorting"} maxRows={maxRows} screenWidth={screenWidth} />
                }
            </Box>
            <Text>{"─".repeat(screenWidth)}</Text>
            <StatusBar dl_info_speed={state.server_state?.dl_info_speed ?? 0} dl_info_data={state.server_state?.dl_info_data ?? 0} up_info_speed={state.server_state?.up_info_speed ?? 0} up_info_data={state.server_state?.up_info_data ?? 0} screenWidth={screenWidth} />
            <HelpBar keys={helpKeys} />
        </Box>
    );
}
