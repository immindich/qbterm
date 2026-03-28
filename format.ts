export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, index);
    return value.toPrecision(3).replace(/\.?0+$/, "") + " " + units[index];
}

export function formatDuration(seconds: number): string {
    if (seconds < 0 || !isFinite(seconds)) return "∞";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h < 24) return `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
}

export function formatProgress(progress: number): string {
    return (progress * 100).toFixed(2) + "%";
}

export function stateIcon(state: string): string {
    switch (state) {
        case "downloading":
        case "forcedDL":
        case "metaDL":
        case "forcedMetaDL":
            return "▼";
        case "uploading":
        case "forcedUP":
        case "stalledUP":
            return "▲";
        case "stoppedDL":
        case "stoppedUP":
        case "pausedDL":
        case "pausedUP":
            return "⏸";
        case "error":
        case "missingFiles":
            return "⚠";
        default:
            return " ";
    }
}

export function stateText(state: string): string {
    switch (state) {
        case "downloading": return "Downloading";
        case "forcedDL": return "[F] Downloading";
        case "metaDL": return "Downloading metadata";
        case "forcedMetaDL": return "[F] Downloading metadata";
        case "uploading": return "Seeding";
        case "forcedUP": return "[F] Seeding";
        case "stalledUP": return "Seeding";
        case "stalledDL": return "Stalled";
        case "stoppedDL": return "Stopped";
        case "stoppedUP": return "Completed";
        case "pausedDL": return "Stopped";
        case "pausedUP": return "Completed";
        case "queuedDL": return "Queued";
        case "queuedUP": return "Queued";
        case "checkingDL": return "Checking";
        case "checkingUP": return "Checking";
        case "queuedForChecking": return "Queued for checking";
        case "checkingResumeData": return "Checking resume data";
        case "moving": return "Moving";
        case "missingFiles": return "Missing Files";
        case "error": return "Errored";
        default: return state;
    }
}
