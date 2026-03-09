import { useState, useEffect, useRef, memo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { getMainData, TransferInfo, type TorrentInfo } from "./api.js";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, index)).toFixed(1) + " " + units[index];
}

function formatProgress(progress: number): string {
    return (progress * 100).toFixed(2) + "%";
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
    { name: "Down Speed", key: "dlspeed", width: 12, render: (t) => formatBytes(t.dlspeed) + "/s", sort: null },
    { name: "Up Speed", key: "upspeed", width: 10, render: (t) => formatBytes(t.upspeed) + "/s", sort: null },
];

interface TableRowProps {
    torrent: TorrentInfo;
    selected: boolean;
}

const TableRow = memo(function TableRow({ torrent, selected }: TableRowProps) {
    return (
        <Box gap={1}>
            <Box width={1}>
                <Text>{selected ? "*" : " "}</Text>
            </Box>
            {columns.map((col) => (
                <Box width={col.width} key={col.name}>
                    <Text wrap="truncate">{col.render(torrent)}</Text>
                </Box>
            ))}
        </Box>
    )
});

interface TableHeaderProps {
    sort_column: number;
    sort_ascending: boolean;
}

function TableHeader({ sort_column, sort_ascending }: TableHeaderProps) {
    return (
        <Box gap={1}>
            <Box width={1}>
                <Text> </Text>
            </Box>
            {columns.map((col, i) => (
                <Box width={col.width} key={col.name}>
                    <Text>{col.name}{i === sort_column ? (sort_ascending ? " ▲" : " ▼") : ""}</Text>
                </Box>
            ))}
        </Box>
    )
}

interface StatusBarProps {
    dl_info_speed: number;
    dl_info_data: number;
    up_info_speed: number;
    up_info_data: number;
}

function StatusBar({ dl_info_speed, dl_info_data, up_info_speed, up_info_data }: StatusBarProps) {
    return (
        <Box gap={1}>
            <Text>Download Speed: {formatBytes(dl_info_speed)}/s</Text>
            <Text>Upload Speed: {formatBytes(up_info_speed)}/s</Text>
        </Box>
    )
}

interface TableProps {
    torrents: TorrentInfo[];
    selected_torrent: string | null;
    scrollOffset: number;
    maxRows: number;
    sort_column: number;
    sort_ascending: boolean;
    screenWidth: number;
}

function Table({ torrents, selected_torrent, scrollOffset, maxRows, sort_column, sort_ascending, screenWidth }: TableProps) {
    const visible = maxRows > 0 ? torrents.slice(scrollOffset, scrollOffset + maxRows) : torrents;

    return (
        <Box flexDirection="column">
            <TableHeader sort_column={sort_column} sort_ascending={sort_ascending} />
            <Text>{"─".repeat(screenWidth)}</Text>
            {visible.map((torrent) => <TableRow torrent={torrent} key={torrent.hash} selected={torrent.hash === selected_torrent} />)}
        </Box>
    )
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

interface AppProps {
    url: string;
    sid: string;
}

export function App({ url, sid }: AppProps) {
    const [state, setState] = useState<TorrentState | null>(null);
    const ridRef = useRef(0);
    const scrollOffsetRef = useRef(0);

    const { exit } = useApp();

    useInput((input, key) => {
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

        const col_delta = key.rightArrow ? 1 : key.leftArrow ? -1 : 0;
        if (col_delta !== 0) {
            setState((prev) => {
                if (prev === null) return prev;
                const new_col = (prev.sort_column + col_delta + columns.length) % columns.length;
                return resortState(prev, { sort_column: new_col });
            });
        }

        if (input === "s") {
            setState((prev) => {
                if (prev === null) return prev;
                return resortState(prev, { sort_ascending: !prev.sort_ascending });
            });
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

    const { stdout } = useStdout();
    const screenWidth = stdout.columns ?? 80;
    const maxRows = (stdout.rows ?? 24) - 5;

    return (
        <Box width="100%" height="100%" flexDirection="column">
            <Table torrents={state.torrents_sorted} selected_torrent={state.selected_torrent} scrollOffset={scrollOffsetRef.current} sort_column={state.sort_column} sort_ascending={state.sort_ascending} maxRows={maxRows} screenWidth={screenWidth} />
            <Box flexGrow={1} />
            <Text>{"─".repeat(screenWidth)}</Text>
            <StatusBar dl_info_speed={state.server_state?.dl_info_speed ?? 0} dl_info_data={state.server_state?.dl_info_data ?? 0} up_info_speed={state.server_state?.up_info_speed ?? 0} up_info_data={state.server_state?.up_info_data ?? 0} />
            <Text>↑↓ navigate  PgUp/PgDn page  Home/End jump  ←→ sort column  s toggle order  q quit</Text>
        </Box>
    );
}
