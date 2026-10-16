import fs from "fs/promises";
import { statSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { AddTorrentOptions } from "./api.js";
import { compact, parseQuery, matches } from "./search.js";

// Things qBittorrent accepts in the `urls` field: magnet links, HTTP(S) links, BitComet
// links, and bare info hashes (v1 SHA-1 or v2 SHA-256)
const URL_PATTERN = /^(magnet:|https?:\/\/|bc:\/\/bt\/)/i;
const INFO_HASH_PATTERN = /^([0-9a-f]{40}|[0-9a-f]{64})$/i;

export function isTorrentUrl(input: string): boolean {
    return URL_PATTERN.test(input.trim());
}

export function isInfoHash(input: string): boolean {
    return INFO_HASH_PATTERN.test(input.trim());
}

// Turns what the user typed or pasted into an absolute path. Dragging a file onto a terminal
// pastes its path quoted or with backslash escapes, depending on the terminal, and some
// paste a file:// URL instead.
export function parsePathInput(input: string, cwd = process.cwd(), home = os.homedir()): string {
    let p = input.trim();
    if (p.length >= 2 && (p[0] === "'" || p[0] === '"') && p.at(-1) === p[0]) {
        p = p.slice(1, -1);
    } else if (p.startsWith("file://")) {
        return fileURLToPath(p);
    } else if (path.sep === "/") {
        p = p.replace(/\\(.)/g, "$1");
    }
    if (p === "~") return home;
    if (p.startsWith("~/")) p = path.join(home, p.slice(2));
    return path.resolve(cwd, p);
}

// Shortens a path under the home directory to ~/..., which parsePathInput expands again
export function displayPath(p: string, home = os.homedir()): string {
    if (p === home) return "~";
    if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
    return p;
}

// What the add-torrent form's input refers to: a URL/magnet/hash, or a local .torrent file
// that is read here and uploaded (so it works when qBittorrent runs on another machine)
export async function resolveTorrentSource(input: string): Promise<Pick<AddTorrentOptions, "urls" | "torrents">> {
    const trimmed = input.trim();
    if (isTorrentUrl(trimmed)) return { urls: [trimmed] };
    const p = parsePathInput(trimmed);
    let data;
    try {
        data = await fs.readFile(p);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        // A file named like a hash wins, but otherwise a hash is sent as one
        if (code === "ENOENT" && isInfoHash(trimmed)) return { urls: [trimmed] };
        if (code === "ENOENT") throw new Error(`File not found: ${displayPath(p)}`);
        if (code === "EISDIR") throw new Error(`${displayPath(p)} is a directory`);
        throw new Error(`Can't read ${displayPath(p)}: ${code ?? String(err)}`);
    }
    return { torrents: [{ name: path.basename(p), data }] };
}

// Where the file chooser opens: at the path already typed into the form if there is one
// (selecting the file if it names one), otherwise in fallbackDir
export function chooserStartPoint(input: string, fallbackDir: string): { dir: string; selection?: string } {
    const trimmed = input.trim();
    if (trimmed && !isTorrentUrl(trimmed)) {
        const p = parsePathInput(trimmed);
        try {
            if (statSync(p).isDirectory()) return { dir: p };
            return { dir: path.dirname(p), selection: path.basename(p) };
        } catch {}
        try {
            if (statSync(path.dirname(p)).isDirectory()) return { dir: path.dirname(p) };
        } catch {}
    }
    return { dir: fallbackDir };
}

export interface DirEntry {
    name: string;
    isDir: boolean;
}

function isTorrentFile(name: string): boolean {
    return name.toLowerCase().endsWith(".torrent");
}

// Directories first, then .torrent files; other files are left out
export function filterAndSortEntries(entries: DirEntry[]): DirEntry[] {
    return entries
        .filter((e) => e.isDir || isTorrentFile(e.name))
        .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        });
}

// The entries matching what's typed in the file chooser, using the same rules as the torrent
// search. Hidden entries are only listed when the filter starts with ".", as in shell globs.
export function filterEntries(entries: DirEntry[], filter: string): DirEntry[] {
    const showHidden = filter.startsWith(".");
    const terms = parseQuery(filter);
    const isHidden = (name: string) => name.startsWith(".") && name !== "..";
    return entries.filter((e) => (showHidden || !isHidden(e.name)) && matches(e.name, terms));
}

// The entry to select when the filter changes: the first that starts with what was typed,
// otherwise the first match
export function bestMatch(entries: DirEntry[], filter: string): DirEntry | undefined {
    const typed = compact(filter);
    return entries.find((e) => compact(e.name).startsWith(typed)) ?? entries[0];
}

export async function listTorrentDir(dir: string): Promise<DirEntry[]> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const entries = await Promise.all(dirents.map(async (d): Promise<DirEntry | null> => {
        if (!d.isSymbolicLink()) return { name: d.name, isDir: d.isDirectory() };
        // Follow symlinks so linked directories can be opened; skip broken ones
        try {
            const stat = await fs.stat(path.join(dir, d.name));
            return { name: d.name, isDir: stat.isDirectory() };
        } catch {
            return null;
        }
    }));
    return filterAndSortEntries(entries.filter((e) => e !== null));
}
