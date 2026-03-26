import { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { getMainData, stopTorrents, startTorrents, HttpError, TransferInfo, type TorrentInfo } from "./api.js";
import { formatBytes } from "./format.js";
import { Table, setRawStatus } from "./table.js";
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

type Mode = "normal" | "sorting" | "add-torrent" | "info";

interface AppProps {
    url: string;
    sid: string;
    defaultSavePath: string;
    rawStatus?: boolean;
    onSessionExpired: () => void;
}

export function App({ url, sid, defaultSavePath, rawStatus: rawStatusProp, onSessionExpired }: AppProps) {
    setRawStatus(rawStatusProp ?? false);
    const [state, setState] = useState<AppState | null>(null);
    const [errored, setErrored] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("normal");
    const [selectedTorrent, setSelectedTorrent] = useState<string | null>(null);
    const ridRef = useRef(0);
    const fetchIdRef = useRef(0);
    const { columns: screenWidth, rows: screenRows } = useTerminalSize();
    const maxRows = screenRows - 5;

    const { exit } = useApp();

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

            if (key.return) {
                setMode("info");
            }

            if (input === "p") {
                if (state === null || selectedTorrent === null) return;
                const torrent = state.torrents[selectedTorrent];
                if (!torrent) return;
                const stopped = ["stoppedDL", "stoppedUP", "pausedDL", "pausedUP"].includes(torrent.state);
                const action = stopped ? startTorrents : stopTorrents;
                action(url, sid, [torrent.hash]).catch(() => {});
            }
        } else if (mode === "add-torrent") {
            if (key.escape) {
                setMode("normal");
            }
        } else if (mode === "sorting") {
            if (key.escape) {
                setMode("normal");
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
        : [["↑↓", "navigate"], ["←→", "scroll"], ["PgUp/PgDn", "page"], ["Home/End", "jump"], ["s", "sort"], ["t", "add torrent"], ["p", "pause/resume"], ["q", "quit"]];

    return (
        <Box width={screenWidth} height={screenRows} flexDirection="column">
            <Box flexGrow={1} flexDirection="column">
                {mode === "add-torrent"
                    ? <AddTorrentForm serverUrl={url} sid={sid} defaultSavePath={defaultSavePath} onClose={() => setMode("normal")} />
                    : mode === "info" && selectedTorrent
                    ? <Info url={url} name={state.torrents[selectedTorrent].name} sid={sid} hash={selectedTorrent} width={screenWidth} height={maxRows + 2} />
                    : <Table torrents={state.torrents} sorting={mode === "sorting"} maxRows={maxRows} screenWidth={screenWidth} onSelectionChange={setSelectedTorrent} />
                }
            </Box>
            <Text>{"─".repeat(screenWidth)}</Text>
            {errored
                ? <Text color="red">{errorMessage}</Text>
                : <StatusBar dl_info_speed={state.server_state?.dl_info_speed ?? 0} dl_info_data={state.server_state?.dl_info_data ?? 0} up_info_speed={state.server_state?.up_info_speed ?? 0} up_info_data={state.server_state?.up_info_data ?? 0} screenWidth={screenWidth} />
            }
            <HelpBar keys={helpKeys} />
        </Box>
    );
}
