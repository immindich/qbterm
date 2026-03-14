import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { authenticate } from "./api.js";

type Field = "url" | "username" | "password";
const fields: Field[] = ["url", "username", "password"];

interface LoginProps {
    defaultUrl?: string;
    defaultUsername?: string;
    onLogin: (url: string, sid: string) => void;
}

export function Login({ defaultUrl, defaultUsername, onLogin }: LoginProps) {
    const [url, setUrl] = useState(defaultUrl ?? "");
    const [username, setUsername] = useState(defaultUsername ?? "");
    const [password, setPassword] = useState("");
    const [focus, setFocus] = useState<Field>(defaultUrl ? (defaultUsername ? "password" : "username") : "url");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useInput((_input, key) => {
        if (key.tab) {
            setFocus((prev) => fields[(fields.indexOf(prev) + 1) % fields.length]);
        }
        if (key.return && !loading) {
            setLoading(true);
            setError(null);
            authenticate(url, username, password)
                .then((sid) => onLogin(url, sid))
                .catch((err) => {
                    setError(err instanceof Error ? err.message : String(err));
                    setLoading(false);
                });
        }
    });

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>qBittorrent Login</Text>
            <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                    <Text>     URL:</Text>
                    <TextInput value={url} onChange={setUrl} focus={focus === "url"}/>
                </Box>
                <Box flexDirection="row" gap={1}>
                    <Text>Username:</Text>
                    <TextInput value={username} onChange={setUsername} focus={focus === "username"}/>
                </Box>
                <Box flexDirection="row" gap={1}>
                    <Text>Password:</Text>
                    <TextInput value={password} onChange={setPassword} focus={focus === "password"} mask="*" />
                </Box>
            </Box>
            {loading && <Text color="yellow">Authenticating...</Text>}
            {error && <Text color="red">{error}</Text>}
            <Text dimColor>Tab to switch fields, Enter to login</Text>
        </Box>
    );
}