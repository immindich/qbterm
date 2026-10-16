// Tests for torrent source and path handling (files.ts). Run with `npm run test:unit`, which builds first.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { isTorrentUrl, parsePathInput, displayPath, filterAndSortEntries, filterEntries, bestMatch, resolveTorrentSource, chooserStartPoint } from "../files.js";

const cwd = "/work";
const home = "/home/me";

test("recognizes URLs qBittorrent can add", () => {
    for (const url of ["magnet:?xt=urn:btih:abc", "https://example.com/a.torrent", "HTTP://example.com/a", "bc://bt/abc", "  magnet:?xt=x  "]) {
        assert.equal(isTorrentUrl(url), true, url);
    }
    for (const notUrl of ["/tmp/a.torrent", "a.torrent", "ftp://example.com/a.torrent", "~/magnet:x"]) {
        assert.equal(isTorrentUrl(notUrl), false, notUrl);
    }
});

test("parses typed, pasted and dragged paths", () => {
    const cases: [input: string, expected: string][] = [
        ["/tmp/a.torrent", "/tmp/a.torrent"],
        ["a.torrent", "/work/a.torrent"],
        ["../a.torrent", "/a.torrent"],
        ["~", "/home/me"],
        ["~/Downloads/a.torrent", "/home/me/Downloads/a.torrent"],
        ["  /tmp/a.torrent  ", "/tmp/a.torrent"],
        // Terminals quote or escape dropped paths
        ["'/tmp/My File.torrent'", "/tmp/My File.torrent"],
        ['"/tmp/My File.torrent"', "/tmp/My File.torrent"],
        ["/tmp/My\\ File\\ \\(1\\).torrent", "/tmp/My File (1).torrent"],
        ["'~/a b.torrent'", "/home/me/a b.torrent"],
        ["file:///tmp/My%20File.torrent", "/tmp/My File.torrent"],
    ];
    for (const [input, expected] of cases) {
        assert.equal(parsePathInput(input, cwd, home), expected, input);
    }
});

test("displayPath abbreviates the home directory", () => {
    assert.equal(displayPath("/home/me", home), "~");
    assert.equal(displayPath("/home/me/Downloads/a.torrent", home), "~/Downloads/a.torrent");
    assert.equal(displayPath("/home/melissa/a.torrent", home), "/home/melissa/a.torrent");
    assert.equal(parsePathInput(displayPath("/home/me/a b.torrent", home), cwd, home), "/home/me/a b.torrent");
});

test("lists directories first, then .torrent files, sorted naturally", () => {
    const entries = [
        { name: "b.torrent", isDir: false },
        { name: "notes.txt", isDir: false },
        { name: "Zeta", isDir: true },
        { name: "ep10.torrent", isDir: false },
        { name: "alpha", isDir: true },
        { name: "ep2.TORRENT", isDir: false },
        { name: ".hidden", isDir: true },
        { name: ".secret.torrent", isDir: false },
    ];
    assert.deepEqual(filterAndSortEntries(entries).map((e) => e.name),
        [".hidden", "alpha", "Zeta", ".secret.torrent", "b.torrent", "ep2.TORRENT", "ep10.torrent"]);
});

test("filters chooser entries as you type", () => {
    const entries = [
        { name: "..", isDir: true },
        { name: ".config", isDir: true },
        { name: "Downloads", isDir: true },
        { name: "Documents", isDir: true },
        { name: "my-downloads-old", isDir: true },
        { name: ".secret.torrent", isDir: false },
        { name: "ubuntu-26.04.1-desktop-amd64.iso.torrent", isDir: false },
    ];
    const names = (filter: string) => filterEntries(entries, filter).map((e) => e.name);
    assert.deepEqual(names(""), ["..", "Downloads", "Documents", "my-downloads-old", "ubuntu-26.04.1-desktop-amd64.iso.torrent"]);
    assert.deepEqual(names("down"), ["Downloads", "my-downloads-old"]);
    assert.deepEqual(names("ubuntu 2604"), ["ubuntu-26.04.1-desktop-amd64.iso.torrent"]);
    assert.deepEqual(names("xyz"), []);
    // A leading "." brings in hidden entries
    assert.deepEqual(names("."), entries.map((e) => e.name));
    assert.deepEqual(names(".con"), [".config"]);

    // Prefer a match that starts with what was typed, even if it's listed later
    const best = (filter: string) => bestMatch(filterEntries(entries, filter), filter)?.name;
    assert.equal(best("do"), "Downloads");
    assert.equal(best("doc"), "Documents");
    assert.equal(best("old"), "my-downloads-old");
    assert.equal(best("Ubuntu-26"), "ubuntu-26.04.1-desktop-amd64.iso.torrent");
    assert.equal(best("xyz"), undefined);
});

test("resolves the add form's input to URLs or file contents", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qbterm-test-"));
    try {
        const file = path.join(dir, "My File.torrent");
        fs.writeFileSync(file, "d4:infod4:name1:aee");

        assert.deepEqual(await resolveTorrentSource(" magnet:?xt=urn:btih:abc "), { urls: ["magnet:?xt=urn:btih:abc"] });

        const resolved = await resolveTorrentSource(`'${file}'`);
        assert.equal(resolved.torrents?.length, 1);
        assert.equal(resolved.torrents?.[0].name, "My File.torrent");
        assert.equal(Buffer.from(resolved.torrents![0].data).toString(), "d4:infod4:name1:aee");

        const hash = "0123456789abcdef0123456789abcdef01234567";
        assert.deepEqual(await resolveTorrentSource(hash), { urls: [hash] });

        await assert.rejects(resolveTorrentSource(path.join(dir, "missing.torrent")), /File not found/);
        await assert.rejects(resolveTorrentSource(dir), /is a directory/);
    } finally {
        fs.rmSync(dir, { recursive: true });
    }
});

test("opens the file chooser at the path typed in the form", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qbterm-test-"));
    try {
        const file = path.join(dir, "a.torrent");
        fs.writeFileSync(file, "");
        assert.deepEqual(chooserStartPoint(file, "/fallback"), { dir, selection: "a.torrent" });
        assert.deepEqual(chooserStartPoint(dir, "/fallback"), { dir });
        assert.deepEqual(chooserStartPoint(path.join(dir, "partly-typed"), "/fallback"), { dir });
        assert.deepEqual(chooserStartPoint("", "/fallback"), { dir: "/fallback" });
        assert.deepEqual(chooserStartPoint("magnet:?xt=x", "/fallback"), { dir: "/fallback" });
        assert.deepEqual(chooserStartPoint("/no/such/dir/a.torrent", "/fallback"), { dir: "/fallback" });
    } finally {
        fs.rmSync(dir, { recursive: true });
    }
});
