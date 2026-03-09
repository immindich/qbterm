async function authenticate(url, username, password) {
    const response = await fetch(`${url}/api/v2/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: url,
        },
        body: new URLSearchParams({ username, password }),
    });

    if (!response.ok) {
        throw new Error(`Authentication failed: HTTP ${response.status}`);
    }

    const setCookie = response.headers.get("set-cookie");
    const match = setCookie && setCookie.match(/SID=([^;]+)/);
    if (!match) {
        throw new Error("Authentication failed: no SID cookie in response");
    }

    return match[1];
}

async function getTorrents(url, sid, filter = "all") {
    const response = await fetch(
        `${url}/api/v2/torrents/info?filter=${filter}`,
        {
            headers: { Cookie: `SID=${sid}` },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to get torrents: HTTP ${response.status}`);
    }

    return response.json();
}

module.exports = { authenticate, getTorrents };