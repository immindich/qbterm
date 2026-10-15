import type { TorrentInfo } from "./api.js";

// Lowercase and drop everything except letters and digits, so names that separate words
// differently ("Big.Buck_Bunny", "big buck bunny", "BigBuckBunny") compare equal. NFKD splits
// accented letters into letter + combining mark, so the mark is dropped too ("é" -> "e").
export function compact(text: string): string {
    return text.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// Each whitespace-separated word is a term; terms that are only punctuation are dropped.
export function parseQuery(query: string): string[] {
    return query.split(/\s+/).map(compact).filter((term) => term.length > 0);
}

// Names rarely change, so cache their compact form. Cleared wholesale if it grows large
// (names of removed torrents are never evicted otherwise).
const compactNames = new Map<string, string>();
const MAX_CACHED_NAMES = 10000;

function compactName(name: string): string {
    let result = compactNames.get(name);
    if (result === undefined) {
        if (compactNames.size >= MAX_CACHED_NAMES) compactNames.clear();
        result = compact(name);
        compactNames.set(name, result);
    }
    return result;
}

// A name matches when every term appears somewhere in its compact form, in any order.
export function matches(name: string, terms: string[]): boolean {
    const target = compactName(name);
    return terms.every((term) => target.includes(term));
}

export function filterTorrents(torrents: TorrentInfo[], terms: string[]): TorrentInfo[] {
    if (terms.length === 0) return torrents;
    return torrents.filter((t) => matches(t.name, terms));
}
