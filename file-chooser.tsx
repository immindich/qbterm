import { useState, useEffect, useRef, useMemo } from "react";
import os from "os";
import path from "path";
import { Box, Text, useInput } from "ink";
import { listTorrentDir, displayPath, filterEntries, bestMatch, chooserStartPoint, type DirEntry } from "./files.js";

interface FileChooserProps {
    initialDir: string;
    // Name of the entry to select once the initial directory is listed
    initialSelection?: string;
    width: number;
    height: number;
    onChoose: (path: string) => void;
    onCancel: () => void;
}

interface Listing {
    dir: string;
    entries: DirEntry[]; // includes ".." unless dir is the root
}

const PARENT: DirEntry = { name: "..", isDir: true };

// Keeps the end of the line, which for a path is the part that tells directories apart
function truncateStart(str: string, width: number): string {
    if (width <= 0) return "";
    if (str.length <= width) return str;
    return "…" + str.slice(str.length - width + 1);
}

// Browses directories and .torrent files. Typing filters the current directory (same matching
// as the torrent search); "/", Tab or → opens the selected folder, so "dow/ubu" goes into
// Downloads and narrows to the ubuntu torrents. Hidden entries show up when the filter starts
// with ".". Pasting or dropping a path jumps to it.
export function FileChooser({ initialDir, initialSelection, width, height, onChoose, onCancel }: FileChooserProps) {
    const [listing, setListing] = useState<Listing | null>(null);
    const [filter, setFilter] = useState("");
    // By name rather than index, so it survives the filter changing
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const loadIdRef = useRef(0);
    const scrollOffsetRef = useRef(0);

    // Lists dir and switches to it, then types `typed` into it (see typeInto). If dir can't be
    // read, the current listing stays and an error is shown.
    function open(dir: string, selectName?: string, typed = "") {
        const thisLoad = ++loadIdRef.current;
        listTorrentDir(dir).then((entries) => {
            if (thisLoad !== loadIdRef.current) return;
            const loaded = { dir, entries: path.dirname(dir) === dir ? entries : [PARENT, ...entries] };
            // Coming back up out of a hidden folder: keep hidden entries listed so it stays selected
            const startFilter = selectName?.startsWith(".") ? "." : "";
            setListing(loaded);
            setError(null);
            scrollOffsetRef.current = 0;
            typeInto(loaded, startFilter, loaded.entries.find((e) => e.name === selectName), typed);
        }, (err: NodeJS.ErrnoException) => {
            if (thisLoad !== loadIdRef.current) return;
            setError(`Can't open ${displayPath(dir)}: ${err.code ?? err.message}`);
        });
    }

    function openFolder(dir: string, entry: DirEntry, typed = "") {
        if (entry === PARENT) {
            if (path.dirname(dir) !== dir) open(path.dirname(dir), path.basename(dir), typed);
        } else if (entry.isDir) {
            open(path.join(dir, entry.name), undefined, typed);
        }
    }

    // Types text into the filter one character at a time; "/" opens the selected folder and the
    // rest goes into the filter there. Keys typed quickly (or over a slow connection) can arrive
    // together, so "lin/arch" has to work in one go as well as key by key.
    function typeInto(target: Listing, startFilter: string, startSelected: DirEntry | undefined, text: string) {
        let typed = startFilter;
        let match = startSelected;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === "/") {
                if (match?.isDir) {
                    openFolder(target.dir, match, text.slice(i + 1));
                    return;
                }
            } else if (ch === "~" && typed === "") {
                open(os.homedir(), undefined, text.slice(i + 1));
                return;
            } else if (ch >= " ") {
                typed += ch;
                match = bestMatch(filterEntries(target.entries, typed), typed);
            }
        }
        setFilter(typed);
        setSelectedName(match?.name ?? null);
    }

    useEffect(() => {
        open(initialDir, initialSelection);
    }, []);

    const entries = useMemo(() => listing ? filterEntries(listing.entries, filter) : [], [listing, filter]);
    const selectedIndex = Math.max(0, entries.findIndex((e) => e.name === selectedName));
    const selected = entries[selectedIndex] as DirEntry | undefined;

    const listHeight = Math.max(1, height - 3 - (error ? 1 : 0)); // title, path, separator

    useInput((input, key) => {
        if (key.escape) {
            // Clearing the filter leaves the selection alone; it's still listed
            if (filter !== "") setFilter("");
            else onCancel();
            return;
        }
        if (!listing) return;
        const { dir } = listing;

        const delta = key.upArrow ? -1 : key.downArrow ? 1 : key.pageUp ? -listHeight : key.pageDown ? listHeight
            : key.home ? -Infinity : key.end ? Infinity : 0;
        if (delta !== 0) {
            if (entries.length > 0) {
                setSelectedName(entries[Math.max(0, Math.min(entries.length - 1, selectedIndex + delta))].name);
            }
        } else if (key.leftArrow) {
            openFolder(dir, PARENT);
        } else if (key.backspace || key.delete) {
            if (filter === "") {
                openFolder(dir, PARENT);
            } else {
                const shorter = filter.slice(0, -1);
                setFilter(shorter);
                if (shorter !== "") setSelectedName(bestMatch(filterEntries(listing.entries, shorter), shorter)?.name ?? null);
            }
        } else if (key.return) {
            if (selected?.isDir) openFolder(dir, selected);
            else if (selected) onChoose(path.join(dir, selected.name));
        } else if (key.rightArrow || key.tab) {
            if (selected) openFolder(dir, selected);
        } else if (input.length > 1 && /^\s*(['"]?[/~]|file:\/\/)/.test(input)) {
            // A pasted or dropped path (typed text that arrives in one chunk won't start like this)
            const target = chooserStartPoint(input, "");
            if (target.dir) open(target.dir, target.selection);
            else setError(`Not found: ${input.trim()}`);
        } else if (input && !key.ctrl && !key.meta) {
            typeInto(listing, filter, selected, input);
        }
    });

    // Keep selection in view
    const maxScrollOffset = Math.max(0, entries.length - listHeight);
    if (scrollOffsetRef.current > maxScrollOffset) {
        scrollOffsetRef.current = maxScrollOffset;
    }
    if (selectedIndex < scrollOffsetRef.current) {
        scrollOffsetRef.current = selectedIndex;
    } else if (selectedIndex >= scrollOffsetRef.current + listHeight) {
        scrollOffsetRef.current = selectedIndex - listHeight + 1;
    }
    const scrollOffset = scrollOffsetRef.current;
    const visible = entries.slice(scrollOffset, scrollOffset + listHeight);

    // The path line doubles as the filter input: "~/Downloads/ubu▌". The path gets cut from the start first.
    const dirPrefix = listing ? displayPath(listing.dir).replace(/\/?$/, "/") : "";
    const filterShown = truncateStart(filter, width - 1);
    const pathShown = truncateStart(dirPrefix, width - 1 - filterShown.length);

    return (
        <Box flexDirection="column">
            <Text bold>Choose a torrent file</Text>
            {listing
                ? <Text>{pathShown}<Text bold>{filterShown}</Text><Text inverse> </Text></Text>
                : <Text>Loading...</Text>}
            <Text>{"─".repeat(width)}</Text>
            {visible.map((entry, i) => {
                const label = entry.isDir ? entry.name + "/" : entry.name;
                const isSelected = scrollOffset + i === selectedIndex;
                return (
                    <Text key={entry.name} inverse={isSelected} color={entry.isDir ? "blue" : undefined} wrap="truncate-end">
                        {isSelected ? label.padEnd(width) : label}
                    </Text>
                );
            })}
            {listing && filter !== "" && entries.length === 0 && <Text dimColor>No matches for "{filter}"</Text>}
            {listing && filter === "" && entries.every((e) => e === PARENT) && <Text dimColor>No folders or .torrent files here</Text>}
            {error && <Text color="red" wrap="truncate-end">{error}</Text>}
        </Box>
    );
}
