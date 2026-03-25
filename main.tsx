import { useState, useEffect, useRef } from "react";
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
        log?: boolean;
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
    const [credentials, setCredentials] = useState<{ url: string; username: string; password: string } | null>(null);
    const [autoLoginFailed, setAutoLoginFailed] = useState(false);
    const [loginMessage, setLoginMessage] = useState<string | null>(null);
    const autoLogin = defaultUrl && defaultUsername && defaultPassword && !autoLoginFailed;

    const handleLogin = (url: string, sid: string, username: string, password: string) => {
        setCredentials({ url, username, password });
        getDefaultSavePath(url, sid)
            .then((defaultSavePath) => setSession({ url, sid, defaultSavePath }))
            .catch(() => setSession({ url, sid, defaultSavePath: "" }));
    };

    const reAuthInProgress = useRef(false);

    const handleSessionExpired = () => {
        if (reAuthInProgress.current) return;
        if (!credentials) {
            setSession(null);
            return;
        }
        reAuthInProgress.current = true;
        authenticate(credentials.url, credentials.username, credentials.password)
            .then((sid) => setSession((prev) => prev && { ...prev, sid }))
            .catch(() => { setLoginMessage("Session expired. Please log in again."); setAutoLoginFailed(true); setSession(null); })
            .finally(() => { reAuthInProgress.current = false; });
    };

    useEffect(() => {
        if (defaultUrl && defaultUsername && defaultPassword) {
            authenticate(defaultUrl, defaultUsername, defaultPassword)
                .then((sid) => handleLogin(defaultUrl, sid, defaultUsername, defaultPassword))
                .catch(() => setAutoLoginFailed(true));
        }
    }, []);

    if (autoLogin && session === null) {
        return <Text color="yellow">Connecting to {defaultUrl}...</Text>;
    }

    if (session === null) {
        return <Login defaultUrl={defaultUrl} defaultUsername={defaultUsername} message={loginMessage ?? undefined} onLogin={handleLogin} />;
    }

    return <App url={session.url} sid={session.sid} defaultSavePath={session.defaultSavePath} rawStatus={rawStatus} onSessionExpired={handleSessionExpired} />;
}

const config = loadConfig();
const conn = config.connection;
if (config.debug?.log) {
    const { enableDebugLog } = await import("./api.js");
    enableDebugLog();
}

render(<Root defaultUrl={conn?.url} defaultUsername={conn?.username} defaultPassword={conn?.password} rawStatus={config.debug?.raw_status} />);
