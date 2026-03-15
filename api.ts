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

export async function getDefaultSavePath(
    url: string,
    sid: string,
): Promise<string> {
    const response = await fetch(`${url}/api/v2/app/defaultSavePath`, {
        headers: { Cookie: `SID=${sid}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to get default save path: HTTP ${response.status}`);
    }

    return response.text();
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

export interface AddTorrentOptions {
    urls?: string[];
    savepath?: string;
    cookie?: string;
    category?: string;
    tags?: string[];
    skip_checking?: boolean;
    stopped?: boolean;
    root_folder?: boolean;
    rename?: string;
    upLimit?: number;
    dlLimit?: number;
    ratioLimit?: number;
    seedingTimeLimit?: number;
    autoTMM?: boolean;
    sequentialDownload?: boolean;
    firstLastPiecePrio?: boolean;
}

export async function addTorrents(
    url: string,
    sid: string,
    options: AddTorrentOptions,
): Promise<void> {
    const form = new FormData();

    if (options.urls) form.append("urls", options.urls.join("\n"));
    if (options.savepath) form.append("savepath", options.savepath);
    if (options.cookie) form.append("cookie", options.cookie);
    if (options.category) form.append("category", options.category);
    if (options.tags) form.append("tags", options.tags.join(","));
    if (options.skip_checking !== undefined) form.append("skip_checking", String(options.skip_checking));
    if (options.stopped !== undefined) form.append("stopped", String(options.stopped));
    if (options.root_folder !== undefined) form.append("root_folder", String(options.root_folder));
    if (options.rename) form.append("rename", options.rename);
    if (options.upLimit !== undefined) form.append("upLimit", String(options.upLimit));
    if (options.dlLimit !== undefined) form.append("dlLimit", String(options.dlLimit));
    if (options.ratioLimit !== undefined) form.append("ratioLimit", String(options.ratioLimit));
    if (options.seedingTimeLimit !== undefined) form.append("seedingTimeLimit", String(options.seedingTimeLimit));
    if (options.autoTMM !== undefined) form.append("autoTMM", String(options.autoTMM));
    if (options.sequentialDownload !== undefined) form.append("sequentialDownload", String(options.sequentialDownload));
    if (options.firstLastPiecePrio !== undefined) form.append("firstLastPiecePrio", String(options.firstLastPiecePrio));

    const response = await fetch(`${url}/api/v2/torrents/add`, {
        method: "POST",
        headers: { Cookie: `SID=${sid}` },
        body: form,
    });

    if (!response.ok) {
        throw new Error(`Failed to add torrent: HTTP ${response.status}`);
    }

    const text = await response.text();
    if (text === "Fails.") {
        throw new Error("Failed to add torrent");
    }
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
