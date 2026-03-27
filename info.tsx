import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getTorrentFiles, type TorrentFile } from "./api.js";

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
    const [files, setFiles] = useState<TorrentFile[]>([]);

    useEffect(() => {
        let active = true;

        function fetchFiles() {
            getTorrentFiles(url, sid, hash).then((data) => {
                if (active) setFiles(data);
            }).catch(() => {});
        }

        fetchFiles();
        const interval = setInterval(fetchFiles, 5000);
        return () => { active = false; clearInterval(interval); };
    }, [url, sid, hash]);

    return (
        <Box flexDirection="column">
            {contentRows(buildDirectory(files)).map((row) => <ContentRow key={row.name} row={row} />)}
        </Box>
    );
}

function Properties({ url, sid, hash }: InfoModeProps) {
    return (
        <Box flexDirection="column">
            <Text>{"Properties"}</Text>
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