import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout, measureElement, type DOMElement } from "ink";
import { getMainData, stopTorrents, startTorrents, deleteTorrents, HttpError, TransferInfo, type TorrentInfo } from "./api.js";
import { formatBytes } from "./format.js";
import { Table, sortTorrents, findSelectedIndex, columnCount } from "./table.js";
import { SearchBar } from "./search-bar.js";
import { parseQuery, filterTorrents } from "./search.js";
import { AddTorrentForm } from "./add-torrent-form.js";
import { Info } from "./info.js";

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

interface AppState {
    torrents: Record<string, TorrentInfo>;
    server_state: TransferInfo;
}

const NO_TORRENTS: Record<string, TorrentInfo> = {};

type Mode = "normal" | "sorting" | "search" | "add-torrent" | "info" | "confirm-delete";

interface AppProps {
    url: string;
    sid: string;
    defaultSavePath: string;
    rawStatus?: boolean;
    showHelpBar?: boolean;
    onSessionExpired: () => void;
}

export function App({ url, sid, defaultSavePath, rawStatus = false, showHelpBar = true, onSessionExpired }: AppProps) {
    const [state, setState] = useState<AppState | null>(null);
    const [errored, setErrored] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("normal");
    const [selection, setSelection] = useState<string | null>(null);
    const [sortColumn, setSortColumn] = useState(0);
    const [sortAscending, setSortAscending] = useState(true);
    // The search filter applies across modes; "search" mode is only for editing it.
    // queryBeforeEdit is restored if the edit is cancelled.
    const [query, setQuery] = useState("");
    const [queryBeforeEdit, setQueryBeforeEdit] = useState("");
    const [deleteFiles, setDeleteFiles] = useState(false);
    const ridRef = useRef(0);
    const fetchIdRef = useRef(0);
    const { columns: screenWidth, rows: screenRows } = useTerminalSize();

    // The content area gets whatever height the footer leaves (the help bar and error
    // messages can wrap), so measure it after layout rather than assuming a footer height.
    const contentRef = useRef<DOMElement>(null);
    const [measuredContentHeight, setMeasuredContentHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        if (!contentRef.current) return;
        const { height } = measureElement(contentRef.current);
        if (height !== measuredContentHeight) setMeasuredContentHeight(height);
    });
    // Until the first measurement, assume the footer doesn't wrap (separator, status bar, help bar)
    const contentHeight = measuredContentHeight ?? screenRows - (showHelpBar ? 3 : 2);
    const maxRows = contentHeight - 2; // table header and separator

    const { exit } = useApp();

    const allTorrents = useMemo(() => Object.values(state?.torrents ?? NO_TORRENTS), [state?.torrents]);
    const searchTerms = useMemo(() => parseQuery(query), [query]);
    const filterActive = searchTerms.length > 0;
    const filtered = useMemo(() => filterTorrents(allTorrents, searchTerms), [allTorrents, searchTerms]);
    const sorted = useMemo(() => sortTorrents(filtered, sortColumn, sortAscending), [filtered, sortColumn, sortAscending]);
    // The stored selection can point at a removed torrent; the effective one falls back to the first row
    const selectedIndex = useMemo(() => findSelectedIndex(sorted, selection), [sorted, selection]);
    const selectedTorrent = sorted[selectedIndex]?.hash ?? null;

    async function fetchData() {
        const thisRequest = ++fetchIdRef.current;
        let data;
        try {
            data = await getMainData(url, sid, ridRef.current);
        } catch (error) {
            if (error instanceof HttpError && error.status === 403) {
                onSessionExpired();
                return;
            }
            setErrored(true);
            setErrorMessage(error instanceof Error ? error.message : String(error));
            return;
        }
        if (thisRequest !== fetchIdRef.current) return;
        setErrored(false);
        setErrorMessage(null);
        ridRef.current = data.rid;

        setState((prev) => {
            // Copy the map once per update, then mutate the copy; copying per torrent is O(n^2).
            const torrents: Record<string, TorrentInfo> = data.full_update ? {} : { ...prev?.torrents };

            if (data.torrents) {
                for (const [hash, partial] of Object.entries(data.torrents)) {
                    torrents[hash] = { ...torrents[hash], ...partial, hash } as TorrentInfo;
                }
            }

            if (data.torrents_removed) {
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

            return { torrents, server_state };
        });
    }

    useInput((input, key) => {
        if (mode === "normal") {
            if (input === "q") {
                exit();
            }

            if (input === "s") {
                setMode("sorting");
            }

            if (input === "t") {
                setMode("add-torrent");
            }

            if (key.return && selectedTorrent !== null) {
                setMode("info");
            }

            if (input === "/") {
                setQueryBeforeEdit(query);
                setMode("search");
            }

            if (key.escape && query !== "") {
                setQuery("");
            }

            if (input === "p") {
                if (state === null || selectedTorrent === null) return;
                const torrent = state.torrents[selectedTorrent];
                if (!torrent) return;
                const stopped = ["stoppedDL", "stoppedUP", "pausedDL", "pausedUP"].includes(torrent.state);
                const action = stopped ? startTorrents : stopTorrents;
                action(url, sid, [torrent.hash]).catch(() => {});
            }

            if (input === "d" || key.delete) {
                if (state === null || selectedTorrent === null) return;
                if (!state.torrents[selectedTorrent]) return;
                setDeleteFiles(false);
                setMode("confirm-delete");
            }
        } else if (mode === "confirm-delete") {
            if (input === "y" || key.return) {
                if (selectedTorrent) {
                    deleteTorrents(url, sid, [selectedTorrent], deleteFiles).catch(() => {});
                }
                setMode("normal");
            }
            if (input === "n" || key.escape) {
                setMode("normal");
            }
            if (input === " ") {
                setDeleteFiles((prev) => !prev);
            }
        } else if (mode === "search") {
            // Typing is handled by the search bar's text input
            if (key.return) {
                if (!filterActive) setQuery("");
                setMode("normal");
            }
            if (key.escape) {
                setQuery(queryBeforeEdit);
                setMode("normal");
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
                setSortColumn((prev) => (prev + dir + columnCount) % columnCount);
            }
            if (input === " ") {
                setSortAscending((prev) => !prev);
            }
        } else if (mode === "info") {
            if (key.escape) {
                setMode("normal");
            }
        }
    });

    useEffect(() => {
        ridRef.current = 0;
        fetchData();
        const interval = setInterval(fetchData, 1000);
        return () => clearInterval(interval);
    }, [url, sid]);

    if (state === null) {
        return <Box width="100%" height="100%"><Text>Loading...</Text></Box>;
    }

    const helpKeys: [string, string][] = mode === "sorting"
        ? [["Tab", "column"], ["Space", "toggle order"], ["Esc", "done"]]
        : mode === "add-torrent"
        ? [["Tab", "switch field"], ["Esc", "close"]]
        : mode === "info"
        ? [["Tab", "switch tab"], ["Esc", "back"]]
        : mode === "confirm-delete"
        ? [["y", "confirm"], ["n", "cancel"], ["Space", "toggle"]]
        : mode === "search"
        ? [["Enter", "apply"], ["Esc", "cancel"], ["↑↓", "navigate"]]
        : [["↑↓", "navigate"], ["←→", "scroll"], ["PgUp/PgDn", "page"], ["Home/End", "jump"],
            ["/", filterActive ? "edit search" : "search"], ...(filterActive ? [["Esc", "clear filter"] as [string, string]] : []),
            ["s", "sort"], ["t", "add torrent"], ["p", "pause/resume"], ["d", "delete"], ["q", "quit"]];

    const showSearchBar = mode === "search" || (filterActive && (mode === "normal" || mode === "sorting"));

    return (
        <Box width={screenWidth} height={screenRows} flexDirection="column">
            <Box ref={contentRef} flexGrow={1} flexShrink={1} flexBasis={0} flexDirection="column">
                {mode === "add-torrent"
                    ? <AddTorrentForm serverUrl={url} sid={sid} defaultSavePath={defaultSavePath} onClose={() => setMode("normal")} />
                    : mode === "confirm-delete" && selectedTorrent && state.torrents[selectedTorrent]
                    ? <Box flexDirection="column" gap={1}>
                        <Text>Delete &quot;{state.torrents[selectedTorrent].name}&quot;?</Text>
                        <Text><Text inverse>[{deleteFiles ? "✓" : " "}]</Text> Delete content files</Text>
                    </Box>
                    : mode === "info" && selectedTorrent
                    ? <Info url={url} name={state.torrents[selectedTorrent].name} sid={sid} hash={selectedTorrent} width={screenWidth} height={contentHeight} />
                    : <Table sorted={sorted} widthTorrents={allTorrents} selectedIndex={selectedIndex} sortColumn={sortColumn} sortAscending={sortAscending}
                        sorting={mode === "sorting"} maxRows={maxRows} screenWidth={screenWidth} rawStatus={rawStatus} textInputActive={mode === "search"}
                        emptyMessage={filterActive ? `No torrents match "${query.trim()}"` : undefined} onSelectionChange={setSelection} />
                }
            </Box>
            <Text>{"─".repeat(screenWidth)}</Text>
            {showSearchBar && <SearchBar editing={mode === "search"} query={query} onChange={setQuery} matchCount={sorted.length} totalCount={allTorrents.length} screenWidth={screenWidth} />}
            {errored
                ? <Text color="red">{errorMessage}</Text>
                : <StatusBar dl_info_speed={state.server_state?.dl_info_speed ?? 0} dl_info_data={state.server_state?.dl_info_data ?? 0} up_info_speed={state.server_state?.up_info_speed ?? 0} up_info_data={state.server_state?.up_info_data ?? 0} screenWidth={screenWidth} />
            }
            {showHelpBar && <HelpBar keys={helpKeys} />}
        </Box>
    );
}
