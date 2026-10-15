// Fake qBittorrent WebUI for benchmarking. Serves auth/login, sync/maindata and torrents/delete with N torrents;
// each poll, roughly a third of the torrents report new speeds (like a busy real client).
// usage: node bench/fake-qbt.mjs <torrents> <port>
import http from "http";

const N = Number(process.argv[2] ?? 500);
const PORT = Number(process.argv[3] ?? 18080);
const CHANGE_FRACTION = 0.33;

// The first torrents get real-world names with inconsistent separators, for testing search
const NAMES = [
    "Big.Buck.Bunny.2008.1080p", "big_buck_bunny_4k", "BigBuckBunny (2008)", "Sintel",
    "ubuntu-26.04.1-desktop-amd64.iso", "Amélie.2001.720p", "Tears of Steel", "debian-13.7.0-amd64-netinst.iso",
];

const torrents = {};
for (let i = 0; i < N; i++) {
    const hash = i.toString(16).padStart(40, "0");
    torrents[hash] = {
        name: NAMES[i] ?? `Some.Linux.Distro.${i}.x86_64.iso`, size: 1e9 + i, total_size: 1e9 + i, progress: Math.random(),
        dlspeed: 0, upspeed: 0, state: i % 3 ? "uploading" : "downloading", eta: 3600, num_seeds: 5, num_leechs: 3,
        ratio: 1.5, added_on: 0, completion_on: 0, category: "", tags: "", save_path: "/tmp", num_complete: 10, num_incomplete: 4,
    };
}

let rid = 0;
let removed = [];
http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/v2/auth/login") {
        res.writeHead(200, { "set-cookie": "SID=bench; path=/" });
        return res.end("Ok.");
    }
    if (url.pathname === "/api/v2/torrents/delete") {
        let body = "";
        for await (const chunk of req) body += chunk;
        for (const hash of (new URLSearchParams(body).get("hashes") ?? "").split("|")) {
            if (torrents[hash]) { delete torrents[hash]; removed.push(hash); }
        }
        res.writeHead(200);
        return res.end("");
    }
    if (url.pathname === "/api/v2/sync/maindata") {
        const requestRid = Number(url.searchParams.get("rid") ?? 0);
        const body = {
            rid: ++rid,
            server_state: { dl_info_speed: Math.floor(Math.random() * 1e7), up_info_speed: Math.floor(Math.random() * 1e6) },
        };
        if (requestRid === 0) {
            body.full_update = true;
            body.torrents = torrents;
        } else {
            body.torrents = {};
            for (const [hash, t] of Object.entries(torrents)) {
                if (Math.random() >= CHANGE_FRACTION) continue;
                t.dlspeed = Math.floor(Math.random() * 1e6);
                t.upspeed = Math.floor(Math.random() * 1e5);
                body.torrents[hash] = { dlspeed: t.dlspeed, upspeed: t.upspeed };
            }
            if (removed.length) {
                body.torrents_removed = removed;
                removed = [];
            }
        }
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(body));
    }
    res.writeHead(200);
    res.end("");
}).listen(PORT);
