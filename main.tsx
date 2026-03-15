import { useState, useEffect } from "react";
import fs from "fs";
import path from "path";
import { parse } from "smol-toml";
import { render, Text } from "ink";
import { authenticate, getDefaultSavePath } from "./api.js";
import { App } from "./app.js";
import { Login } from "./login.js";

interface Config {
    connection?: {
        url?: string;
        username?: string;
        password?: string;
    };
    debug?: {
        raw_status?: boolean;
    };
}

const CONFIG_PATH = path.join(process.cwd(), "config.toml");

function loadConfig(): Config {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`Config file not found: ${CONFIG_PATH}`);
        console.error(
            "Copy config.example.toml to config.toml and fill in your settings.",
        );
        process.exit(1);
    }

    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return parse(raw) as unknown as Config;
}

interface RootProps {
    defaultUrl?: string;
    defaultUsername?: string;
    defaultPassword?: string;
    rawStatus?: boolean;
}

function Root({ defaultUrl, defaultUsername, defaultPassword, rawStatus }: RootProps) {
    const [session, setSession] = useState<{ url: string; sid: string; defaultSavePath: string } | null>(null);
    const [autoLoginFailed, setAutoLoginFailed] = useState(false);
    const autoLogin = defaultUrl && defaultUsername && defaultPassword && !autoLoginFailed;

    const handleLogin = (url: string, sid: string) => {
        getDefaultSavePath(url, sid)
            .then((defaultSavePath) => setSession({ url, sid, defaultSavePath }))
            .catch(() => setSession({ url, sid, defaultSavePath: "" }));
    };

    useEffect(() => {
        if (defaultUrl && defaultUsername && defaultPassword) {
            authenticate(defaultUrl, defaultUsername, defaultPassword)
                .then((sid) => handleLogin(defaultUrl, sid))
                .catch(() => setAutoLoginFailed(true));
        }
    }, []);

    if (autoLogin && session === null) {
        return <Text color="yellow">Connecting to {defaultUrl}...</Text>;
    }

    if (session === null) {
        return <Login defaultUrl={defaultUrl} defaultUsername={defaultUsername} onLogin={handleLogin} />;
    }

    return <App url={session.url} sid={session.sid} defaultSavePath={session.defaultSavePath} rawStatus={rawStatus} />;
}

const config = loadConfig();
const conn = config.connection;
render(<Root defaultUrl={conn?.url} defaultUsername={conn?.username} defaultPassword={conn?.password} rawStatus={config.debug?.raw_status} />);
