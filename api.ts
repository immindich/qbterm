export interface TorrentInfo {
    hash: string;
    name: string;
    size: number;
    total_size: number;
    progress: number;
    dlspeed: number;
    upspeed: number;
    state: string;
    eta: number;
    category: string;
    tags: string;
    added_on: number;
    completion_on: number;
    last_activity: number;
    num_seeds: number;
    num_leechs: number;
    ratio: number;
    uploaded: number;
    downloaded: number;
    amount_left: number;
}

export interface TransferInfo {
    dl_info_speed: number;
    dl_info_data: number;
    up_info_speed: number;
    up_info_data: number;
    dl_rate_limit: number;
    up_rate_limit: number;
    dht_nodes: number;
    connection_status: string;
    queueing: boolean;
    use_alt_speed_limits: boolean;
    refresh_interval: number;
}

export interface MainData {
    rid: number;
    full_update?: boolean;
    torrents?: Record<string, Partial<TorrentInfo>>;
    torrents_removed?: string[];
    server_state?: Partial<TransferInfo>;
    categories?: Record<string, unknown>;
    categories_removed?: string[];
    tags?: string[];
    tags_removed?: string[];
}

export async function authenticate(
    url: string,
    username: string,
    password: string,
): Promise<string> {
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

export async function getTorrents(
    url: string,
    sid: string,
    filter: string = "all",
): Promise<TorrentInfo[]> {
    const response = await fetch(
        `${url}/api/v2/torrents/info?filter=${filter}`,
        {
            headers: { Cookie: `SID=${sid}` },
        },
    );

    if (!response.ok) {
        throw new Error(`Failed to get torrents: HTTP ${response.status}`);
    }

    return response.json() as Promise<TorrentInfo[]>;
}

export async function getMainData(
    url: string,
    sid: string,
    rid: number = 0,
): Promise<MainData> {
    const response = await fetch(
        `${url}/api/v2/sync/maindata?rid=${rid}`,
        {
            headers: { Cookie: `SID=${sid}` },
        },
    );

    if (!response.ok) {
        throw new Error(`Failed to get maindata: HTTP ${response.status}`);
    }

    return response.json() as Promise<MainData>;
}
