import { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { getMainData, type TorrentInfo } from "./api.js";

function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, index)).toFixed(2) + " " + units[index];
}

function formatProgress(progress: number): string {
    return (progress * 100).toFixed(2) + "%";
}

function TableRow({ torrent, selected }: { torrent: TorrentInfo, selected: boolean }) {
    return (
        <Box gap={1}>
            <Box width={1}>
                <Text>{selected ? "*" : " "}</Text>
            </Box>
            <Box width={10}>
                <Text wrap="truncate">{torrent.name}</Text>
            </Box>
            <Box width={10}>
                <Text>{formatBytes(torrent.size)}</Text>
            </Box>
            <Box width={10}>
                <Text>{formatProgress(torrent.progress)}</Text>
            </Box>
        </Box>
    )
}

function TableHeader() {
    return (
        <Box gap={1}>
            <Box width={1}>
                <Text> </Text>
            </Box>
            <Box width={10}>
                <Text>Name</Text>
            </Box>
            <Box width={10}>
                <Text>Size</Text>
            </Box>
            <Box width={10}>
                <Text>Progress</Text>
            </Box>
        </Box>
    )
}

function Table({ torrents, selected_torrent }: { torrents: TorrentInfo[], selected_torrent: string | null }) {
    return (
        <Box flexDirection="column">
            <TableHeader />
            {torrents.map((torrent) => <TableRow torrent={torrent} key={torrent.hash} selected={torrent.hash === selected_torrent} />)}
        </Box>
    )
}

interface TorrentState {
    torrents: Record<string, TorrentInfo>;
    torrents_sorted: TorrentInfo[];
    selected_torrent: string | null;
    selected_torrent_index: number;
}

export function App({ url, sid }: { url: string; sid: string }) {
    const [state, setState] = useState<TorrentState | null>(null);
    const ridRef = useRef(0);

    const { exit } = useApp();

    useInput((input, key) => {
        if (input === "q") {
            exit();
        }

        const delta = key.upArrow ? -1 : key.downArrow ? 1 : 0;
        if (delta !== 0) {
            setState((prev) => {
                if (prev === null || prev.torrents_sorted.length === 0) {
                    return prev;
                }

                const len = prev.torrents_sorted.length;
                const new_index = (prev.selected_torrent_index + delta + len) % len;
                return { ...prev, selected_torrent_index: new_index, selected_torrent: prev.torrents_sorted[new_index].hash };
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

                const torrents_sorted = Object.values(torrents).sort((a, b) =>
                    a.name.localeCompare(b.name)
                );

                const prev_selected = prev?.selected_torrent ?? null;
                const still_exists = prev_selected !== null && torrents[prev_selected] !== undefined;
                const first_hash = torrents_sorted.length > 0 ? torrents_sorted[0].hash : null;

                const selected_torrent = still_exists ? prev_selected : first_hash;
                const selected_torrent_index = selected_torrent
                    ? torrents_sorted.findIndex((t) => t.hash === selected_torrent)
                    : 0;

                return { torrents, torrents_sorted, selected_torrent, selected_torrent_index };
            });
        }

        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [url, sid]);

    if (state === null) {
        return <Text>Loading...</Text>;
    }

    return <Table torrents={state.torrents_sorted} selected_torrent={state.selected_torrent} />;
}
