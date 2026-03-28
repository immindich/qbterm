import { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { getTorrentFiles, getTorrentProperties, getTorrentPeers, type TorrentProperties, type TorrentFile, type TorrentPeer } from "./api.js";
import { formatBytes, formatProgress } from "./format.js";

function usePolling<T>(fetcher: () => Promise<T>, deps: unknown[], interval: number = 5000): T | null {
    const [data, setData] = useState<T | null>(null);
    const stableFetcher = useCallback(fetcher, deps);

    useEffect(() => {
        let active = true;

        function poll() {
            stableFetcher().then((result) => {
                if (active) setData(result);
            }).catch(() => {});
        }

        poll();
        const id = setInterval(poll, interval);
        return () => { active = false; clearInterval(id); };
    }, [stableFetcher, interval]);

    return data;
}

interface InfoModeProps {
    url: string;
    sid: string;
    hash: string;
}

interface Directory {
    children_map: Record<string, Directory | number>;
}

function addFile(directory: Directory, name: string, index: number): void {
    const path = name.split("/");
    let pos = 0;

    let current = directory;

    while (pos < path.length - 1) {
        const segment = path[pos];
        if (!current.children_map[segment] || typeof current.children_map[segment] === "number") {
            current.children_map[segment] = { children_map: {} } as Directory;
        }
        current = current.children_map[segment] as Directory;
        pos++;
    }

    current.children_map[path[pos]] = index;
}

function buildDirectory(files: TorrentFile[]): Directory {
    const root: Directory = { children_map: {} };
    for (const file of files) addFile(root, file.name, file.index);
    return root;
}

interface ContentRowProps {
    name: string;
    prefix: string;
    is_file: boolean;
}

function contentRows(root: Directory): ContentRowProps[] {
    const rows: ContentRowProps[] = [];
    const stack: { dir: Directory; entries: [string, Directory | number][]; index: number; isRoot: boolean; isLast: boolean[] }[] = [];

    const rootEntries = Object.entries(root.children_map).sort(([a], [b]) => a.localeCompare(b));
    stack.push({ dir: root, entries: rootEntries, index: 0, isRoot: true, isLast: [] });

    while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (frame.index >= frame.entries.length) {
            stack.pop();
            continue;
        }

        const entryIndex = frame.index++;
        const [name, child] = frame.entries[entryIndex];
        const last = entryIndex === frame.entries.length - 1;

        const indent = frame.isLast.map((l) => l ? "   " : "│  ").join("");
        const branch = frame.isRoot ? "" : last ? "└─ " : "├─ ";
        const prefix = indent + branch;

        if (typeof child === "number") {
            rows.push({ name, prefix, is_file: true });
        } else {
            rows.push({ name, prefix, is_file: false });
            const entries = Object.entries(child.children_map).sort(([a], [b]) => a.localeCompare(b));
            stack.push({ dir: child, entries, index: 0, isRoot: false, isLast: frame.isRoot ? [] : [...frame.isLast, last] });
        }
    }

    return rows;
}

function ContentRow({ row }: { row: ContentRowProps }) {
    return (
        <Box flexDirection="row">
            <Text>{row.prefix}{row.name}</Text>
        </Box>
    );
}

function Content({ url, sid, hash }: InfoModeProps) {
    const files = usePolling(() => getTorrentFiles(url, sid, hash), [url, sid, hash]);

    return (
        <Box flexDirection="column">
            {files && contentRows(buildDirectory(files)).map((row) => <ContentRow key={row.name} row={row} />)}
        </Box>
    );
}

function formatTotalSession(total: number, session: number): string {
    return formatBytes(total) + " (" + formatBytes(session) + " this session)";
}

interface PropertiesRow {
    name: string;
    value: (p: TorrentProperties) => string;
}

const propertiesRows: PropertiesRow[] = [
    { name: "Downloaded", value: (p) => formatTotalSession(p.total_downloaded, p.total_downloaded_session)},
    { name: "Uploaded", value: (p) => formatTotalSession(p.total_uploaded, p.total_uploaded_session)},
    { name: "Ratio", value: (p) => (p.share_ratio ?? 0).toFixed(2)},
];

function Properties({ url, sid, hash }: InfoModeProps) {
    const properties = usePolling(() => getTorrentProperties(url, sid, hash), [url, sid, hash]);

    return (
        <Box flexDirection="column">
            {
            properties && propertiesRows.map((row) => (
                <Box key={row.name}>
                    <Box width={20}><Text>{row.name}</Text></Box>
                    <Box width="100%"><Text>{row.value(properties)}</Text></Box>
                </Box>
            ))
            }
        </Box>
    );
}

function countryFlag(code: string): string {
    if (!code || code.length !== 2) return "  ";
    return String.fromCodePoint(
        code.toUpperCase().charCodeAt(0) - 0x41 + 0x1F1E6,
        code.toUpperCase().charCodeAt(1) - 0x41 + 0x1F1E6,
    );
}

function Peers({ url, sid, hash }: InfoModeProps) {
    const peers = usePolling(() => getTorrentPeers(url, sid, hash), [url, sid, hash]);

    return (
        <Box flexDirection="column">
            <Box>
                <Box width={6}><Text bold>Flag</Text></Box>
                <Box width={18}><Text bold>IP</Text></Box>
                <Box width={10}><Text bold>Progress</Text></Box>
            </Box>
            {peers && peers.map((peer) => (
                <Box key={`${peer.ip}:${peer.port}`}>
                    <Box width={6}><Text>{countryFlag(peer.country_code)}</Text></Box>
                    <Box width={18}><Text>{peer.ip}</Text></Box>
                    <Box width={10}><Text>{formatProgress(peer.progress)}</Text></Box>
                </Box>
            ))}
        </Box>
    );
}

interface Mode {
    name: string;
    component: (props: InfoModeProps) => React.ReactNode;
}

const modes: Mode[] = [
    { name: "Properties", component: Properties },
    { name: "Content", component: Content },
    { name: "Peers", component: Peers },
];

interface InfoProps {
    url: string;
    name: string;
    sid: string;
    hash: string;
    width: number;
    height: number;
}

export function Info({ url, name, sid, hash, width, height }: InfoProps) {
    const [mode, setMode] = useState<number>(0);

    useInput((input, key) => {
        if (key.tab) {
            const dir = key.shift ? -1 : 1;
            setMode((prev) => (prev + dir + modes.length) % modes.length);
        }
    });

    const Component = modes[mode].component;

    return (
        <Box width={width} height={height} flexDirection="column">
            <Text bold={true}>{name}</Text>
            <Text>{"─".repeat(width)}</Text>
            <Box flexDirection="column">
                <Component url={url} sid={sid} hash={hash} />
            </Box>
        </Box>
    );
}