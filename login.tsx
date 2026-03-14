import { useState } from "react";
import { Text } from "ink";
import { authenticate } from "./api.js";
import { Form } from "./form.js";

interface LoginProps {
    defaultUrl?: string;
    defaultUsername?: string;
    onLogin: (url: string, sid: string) => void;
}

export function Login({ defaultUrl, defaultUsername, onLogin }: LoginProps) {
    const [url, setUrl] = useState(defaultUrl ?? "");
    const [username, setUsername] = useState(defaultUsername ?? "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const initialFocus = defaultUrl ? (defaultUsername ? 2 : 1) : 0;

    function handleSubmit() {
        if (loading) return;
        setLoading(true);
        setError(null);
        authenticate(url, username, password)
            .then((sid) => onLogin(url, sid))
            .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            });
    }

    return (
        <>
            <Form
                title="qBittorrent Login"
                fields={[
                    { label: "URL", value: url, onChange: setUrl },
                    { label: "Username", value: username, onChange: setUsername },
                    { label: "Password", value: password, onChange: setPassword, mask: "*" },
                ]}
                initialFocusIndex={initialFocus}
                onSubmit={handleSubmit}
            />
            {loading && <Text color="yellow">Authenticating...</Text>}
            {error && <Text color="red">{error}</Text>}
            <Text dimColor>Tab to switch fields, Enter to login</Text>
        </>
    );
}
