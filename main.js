const fs = require("fs");
const path = require("path");
const TOML = require("smol-toml");
const { authenticate, getTorrents } = require("./api");

const CONFIG_PATH = path.join(__dirname, "config.toml");

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`Config file not found: ${CONFIG_PATH}`);
        console.error(
            "Copy config.example.toml to config.toml and fill in your settings."
        );
        process.exit(1);
    }

    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return TOML.parse(raw);
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function printTorrents(torrents) {
    console.clear();
    if (torrents.length === 0) {
        console.log("No active torrents.");
        return;
    }
    for (const t of torrents) {
        const pct = (t.progress * 100).toFixed(1);
        const dl = formatBytes(t.dlspeed);
        const ul = formatBytes(t.upspeed);
        console.log(`${t.name}`);
        console.log(`  ${pct}% | DL: ${dl}/s | UL: ${ul}/s | ${t.state}`);
    }
}

async function main() {
    const config = loadConfig();
    const { url, username, password } = config.connection;

    console.log(`Connecting to ${url}...`);
    const sid = await authenticate(url, username, password);
    console.log("Authenticated. Fetching torrents...\n");

    while (true) {
        const torrents = await getTorrents(url, sid, "active");
        printTorrents(torrents);
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
}

main();
