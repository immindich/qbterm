// Fake qBittorrent WebUI for benchmarking and manual testing. Serves N torrents through
// auth/login, sync/maindata, torrents/delete and the info view's endpoints (torrents/properties,
// torrents/files, sync/torrentPeers). Each poll, roughly a third of the torrents report new
// speeds (like a busy real client).
//
// Static details (files, piece size, dates, peers, ...) come from a random generator seeded by
// the torrent's index, so they're the same on every request and every run; live values (speeds,
// peer progress) change over time.
//
// usage: node bench/fake-qbt.mjs <torrents> <port>
import http from "http";

const N = Number(process.argv[2] ?? 500);
const PORT = Number(process.argv[3] ?? 18080);
const CHANGE_FRACTION = 0.33;
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const INFINITE_ETA = 8640000; // what qBittorrent reports when there's no ETA
const SAVE_PATH = "/downloads/";

// The first torrents get real-world names with inconsistent separators, for testing search
const NAMES = [
    "Big.Buck.Bunny.2008.1080p", "big_buck_bunny_4k", "BigBuckBunny (2008)", "Sintel",
    "ubuntu-26.04.1-desktop-amd64.iso", "Amélie.2001.720p", "Tears of Steel", "debian-13.7.0-amd64-netinst.iso",
];
const CREATORS = ["qBittorrent v5.0.2", "mktorrent 1.1", "Transmission/4.0.5", "libtorrent 2.0.10", ""];
const COMMENTS = ["", "Official release", "Seed after downloading!", "Torrent created for testing", "https://example.org/release-notes"];
const CLIENTS = [ // [client, peer ID prefix]
    ["qBittorrent/5.0.2", "-qB5020-"], ["Transmission 4.0.5", "-TR4050-"], ["Deluge 2.1.1", "-DE2110-"],
    ["libtorrent (Rasterbar) 2.0.10", "-LT2010-"], ["μTorrent 3.6.0", "-UT3600-"], ["BitComet 2.10", "-BC0210-"],
];
const COUNTRIES = [
    ["US", "United States"], ["DE", "Germany"], ["JP", "Japan"], ["BR", "Brazil"], ["NL", "Netherlands"], ["FR", "France"],
    ["GB", "United Kingdom"], ["CA", "Canada"], ["SE", "Sweden"], ["AU", "Australia"], ["KR", "South Korea"], ["PL", "Poland"],
];
// Documentation-only address ranges (RFC 5737 / RFC 3849), so no real hosts appear
const IP_PREFIXES = ["192.0.2.", "198.51.100.", "203.0.113."];
const MB = 1024 * 1024;

// mulberry32: small seeded PRNG returning floats in [0, 1)
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Smallest power-of-two piece size (256 KiB - 16 MiB) giving at most ~2000 pieces
function pieceSizeFor(size) {
    let piece = 256 * 1024;
    while (size / piece > 2000 && piece < 16 * MB) piece *= 2;
    return piece;
}

// File layout: .iso names are single files; everything else is a folder of video, sample,
// subtitles and an .nfo, with some extras. Returns [relative path, share of total size] pairs.
function fileLayout(name, rng) {
    if (name.endsWith(".iso")) return [[name, 1]];
    const layout = [
        [`${name}/${name}.mkv`, 0],
        [`${name}/Sample/${name}.sample.mkv`, 0.02],
        [`${name}/Subs/English.srt`, 0.0001],
        [`${name}/Subs/Spanish.srt`, 0.0001],
        [`${name}/${name}.nfo`, 0.00001],
    ];
    if (rng() < 0.5) layout.push([`${name}/Extras/Behind.the.Scenes.mkv`, 0.12]);
    const rest = layout.reduce((sum, [, share]) => sum + share, 0);
    layout[0][1] = 1 - rest;
    return layout;
}

function makeTorrent(i) {
    const rng = seededRandom(i + 1);
    const hash = i.toString(16).padStart(40, "0");
    const name = NAMES[i] ?? `Some.Linux.Distro.${i}.x86_64.iso`;
    const downloading = i % 3 === 0;
    const size = randInt(rng, 50, 8000) * MB + randInt(rng, 0, MB);
    const progress = downloading ? Math.round(rng() * 950) / 1000 : 1;
    const ratio = downloading ? rng() * 0.3 : 0.2 + rng() * 4;
    const addedOn = NOW - randInt(rng, 1, 400) * DAY;
    const completionOn = downloading ? -1 : addedOn + randInt(rng, 600, 3 * DAY);
    const numSeeds = randInt(rng, 0, 12);
    const numLeechs = randInt(rng, 0, 8);
    const pieceSize = pieceSizeFor(size);

    // Files: sizes from the layout shares, each file's progress near the torrent's
    let offset = 0;
    const files = fileLayout(name, rng).map(([path, share], index, layout) => {
        const fileSize = index === layout.length - 1 ? size - offset : Math.floor(size * share);
        const skipped = downloading && path.includes("/Sample/") && rng() < 0.5;
        const fileProgress = skipped ? 0 : downloading ? Math.min(1, Math.max(0, progress + (rng() - 0.5) * 0.2)) : 1;
        const file = {
            index, name: path, size: fileSize, progress: fileProgress,
            priority: skipped ? 0 : 1,
            is_seed: !downloading,
            piece_range: [Math.floor(offset / pieceSize), Math.floor((offset + Math.max(fileSize, 1) - 1) / pieceSize)],
            availability: downloading ? Math.round((0.5 + rng() * 3) * 1000) / 1000 : -1,
        };
        offset += fileSize;
        return file;
    });

    // Connected peers: the seeds have the whole torrent, the leechers part of it
    const peers = Array.from({ length: numSeeds + numLeechs }, (_, p) => {
        const [code, country] = pick(rng, COUNTRIES);
        const [client, peerIdClient] = pick(rng, CLIENTS);
        const ipv6 = rng() < 0.15;
        return {
            ip: ipv6 ? `2001:db8::${randInt(rng, 1, 0xffff).toString(16)}` : pick(rng, IP_PREFIXES) + randInt(rng, 1, 254),
            port: randInt(rng, 1024, 65535),
            client,
            peer_id_client: peerIdClient,
            connection: rng() < 0.6 ? "μTP" : "BT",
            country, country_code: code.toLowerCase(),
            flags: pick(rng, ["D U I E P", "U X E P", "d D H E", "I H X", "U I E"]),
            flags_desc: "",
            isSeed: p < numSeeds,
            progress: p < numSeeds ? 1 : Math.round(rng() * 1000) / 1000,
            relevance: Math.round(rng() * 1000) / 1000,
            files: "",
        };
    });

    const info = {
        name, size, total_size: size, progress, dlspeed: 0, upspeed: 0,
        state: downloading ? "downloading" : "uploading",
        eta: downloading ? randInt(rng, 60, 2 * DAY) : INFINITE_ETA,
        num_seeds: numSeeds, num_leechs: numLeechs, num_complete: numSeeds + randInt(rng, 0, 400), num_incomplete: numLeechs + randInt(rng, 0, 100),
        ratio, added_on: addedOn, completion_on: completionOn, category: "", tags: "", save_path: SAVE_PATH,
    };

    const details = {
        files, peers, pieceSize,
        creationDate: addedOn - randInt(rng, 0, 30 * DAY),
        createdBy: pick(rng, CREATORS),
        comment: pick(rng, COMMENTS),
        isPrivate: rng() < 0.2,
        wasted: randInt(rng, 0, 4) * pieceSize,
        sessionShare: rng(),
        dlSpeedAvg: randInt(rng, 200, 20000) * 1024,
        upSpeedAvg: randInt(rng, 10, 2000) * 1024,
    };

    return [hash, info, details];
}

const torrents = {};
const details = {};
for (let i = 0; i < N; i++) {
    const [hash, info, extra] = makeTorrent(i);
    torrents[hash] = info;
    details[hash] = extra;
}

function properties(hash) {
    const t = torrents[hash];
    const d = details[hash];
    const downloaded = Math.floor(t.size * t.progress) + d.wasted;
    const uploaded = Math.floor(t.size * t.ratio);
    const elapsed = NOW - t.added_on;
    const piecesNum = Math.ceil(t.size / d.pieceSize);
    return {
        save_path: t.save_path,
        creation_date: d.creationDate,
        piece_size: d.pieceSize,
        comment: d.comment,
        total_wasted: d.wasted,
        total_uploaded: uploaded,
        total_uploaded_session: Math.floor(uploaded * d.sessionShare),
        total_downloaded: downloaded,
        total_downloaded_session: Math.floor(downloaded * d.sessionShare),
        up_limit: -1,
        dl_limit: -1,
        time_elapsed: elapsed,
        seeding_time: t.completion_on > 0 ? NOW - t.completion_on : 0,
        nb_connections: t.num_seeds + t.num_leechs,
        nb_connections_limit: 100,
        share_ratio: t.ratio,
        addition_date: t.added_on,
        completion_date: t.completion_on,
        created_by: d.createdBy,
        dl_speed_avg: d.dlSpeedAvg,
        dl_speed: t.dlspeed,
        eta: t.eta,
        last_seen: NOW - randInt(Math.random, 0, 600),
        peers: t.num_leechs,
        peers_total: t.num_incomplete,
        pieces_have: Math.floor(piecesNum * t.progress),
        pieces_num: piecesNum,
        reannounce: randInt(Math.random, 0, 1800),
        seeds: t.num_seeds,
        seeds_total: t.num_complete,
        total_size: t.size,
        up_speed_avg: d.upSpeedAvg,
        up_speed: t.upspeed,
        isPrivate: d.isPrivate,
    };
}

// Peers with live speeds; leechers that are downloading from us slowly make progress
function peers(hash) {
    const result = {};
    for (const peer of details[hash].peers) {
        const { isSeed, ...fields } = peer;
        if (!isSeed && peer.progress < 1) peer.progress = Math.min(1, peer.progress + Math.random() * 0.002);
        result[`${peer.ip}:${peer.port}`] = {
            ...fields,
            progress: peer.progress,
            dl_speed: isSeed ? Math.floor(Math.random() * 500 * 1024) : 0,
            up_speed: isSeed ? 0 : Math.floor(Math.random() * 200 * 1024),
            downloaded: Math.floor(Math.random() * 50 * MB),
            uploaded: Math.floor(Math.random() * 50 * MB),
        };
    }
    return result;
}

function json(res, body) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
}

function notFound(res) {
    res.writeHead(404);
    res.end("Not Found");
}

let rid = 0;
let removed = [];
http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const hash = url.searchParams.get("hash");
    switch (url.pathname) {
        case "/api/v2/auth/login":
            res.writeHead(200, { "set-cookie": "SID=bench; path=/" });
            return res.end("Ok.");

        case "/api/v2/app/defaultSavePath":
            res.writeHead(200);
            return res.end(SAVE_PATH);

        case "/api/v2/torrents/delete": {
            let body = "";
            for await (const chunk of req) body += chunk;
            for (const h of (new URLSearchParams(body).get("hashes") ?? "").split("|")) {
                if (torrents[h]) { delete torrents[h]; delete details[h]; removed.push(h); }
            }
            res.writeHead(200);
            return res.end("");
        }

        case "/api/v2/torrents/properties":
            return torrents[hash] ? json(res, properties(hash)) : notFound(res);

        case "/api/v2/torrents/files": {
            if (!torrents[hash]) return notFound(res);
            const indexes = url.searchParams.get("indexes")?.split("|").map(Number);
            const files = details[hash].files;
            return json(res, indexes ? files.filter((f) => indexes.includes(f.index)) : files);
        }

        case "/api/v2/sync/torrentPeers":
            return torrents[hash] ? json(res, { full_update: true, rid: ++rid, show_flags: true, peers: peers(hash) }) : notFound(res);

        case "/api/v2/sync/maindata": {
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
                for (const [h, t] of Object.entries(torrents)) {
                    if (Math.random() >= CHANGE_FRACTION) continue;
                    t.dlspeed = t.state === "downloading" ? Math.floor(Math.random() * 1e6) : 0;
                    t.upspeed = Math.floor(Math.random() * 1e5);
                    body.torrents[h] = { dlspeed: t.dlspeed, upspeed: t.upspeed };
                }
                if (removed.length) {
                    body.torrents_removed = removed;
                    removed = [];
                }
            }
            return json(res, body);
        }

        default:
            res.writeHead(200);
            return res.end("");
    }
}).listen(PORT);
