import { useState } from "react";
import fs from "fs";
import os from "os";
import path from "path";
import { Text } from "ink";
import { addTorrents } from "./api.js";
import { Form } from "./form.js";
import { FileChooser } from "./file-chooser.js";
import { resolveTorrentSource, chooserStartPoint, displayPath } from "./files.js";

interface AddTorrentFormProps {
    serverUrl: string;
    sid: string;
    defaultSavePath: string;
    width: number;
    height: number;
    // The file chooser replaces the form while open; App owns this so Escape and the help bar
    // can tell the two apart
    choosingFile: boolean;
    onChoosingFileChange: (choosing: boolean) => void;
    onClose: () => void;
}

// Field indexes in the form
const SOURCE_FIELD = 0;
const CHOOSE_BUTTON = 1;

// The directory of the last chosen file, so the chooser reopens there for the rest of the session
let lastChooserDir: string | null = null;

function defaultChooserDir(): string {
    if (lastChooserDir) return lastChooserDir;
    const downloads = path.join(os.homedir(), "Downloads");
    return fs.existsSync(downloads) ? downloads : os.homedir();
}

export function AddTorrentForm({ serverUrl, sid, defaultSavePath, width, height, choosingFile, onChoosingFileChange, onClose }: AddTorrentFormProps) {
    const [source, setSource] = useState("");
    const [savePath, setSavePath] = useState(defaultSavePath);
    const [startPaused, setStartPaused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [chooserStart, setChooserStart] = useState<{ dir: string; selection?: string }>({ dir: "" });
    // The form remounts when the chooser closes: focus the source field after choosing a file
    // (so Enter adds it), or the button again if the chooser was cancelled
    const [focusAfterChooser, setFocusAfterChooser] = useState(SOURCE_FIELD);

    function handleSubmit() {
        if (loading || !source.trim()) return;
        setLoading(true);
        setError(null);
        resolveTorrentSource(source)
            .then((torrent) => addTorrents(serverUrl, sid, { ...torrent, savepath: savePath, stopped: startPaused }))
            .then(() => onClose())
            .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            });
    }

    function openChooser() {
        setChooserStart(chooserStartPoint(source, defaultChooserDir()));
        setFocusAfterChooser(CHOOSE_BUTTON);
        onChoosingFileChange(true);
    }

    function handleChoose(file: string) {
        lastChooserDir = path.dirname(file);
        setSource(displayPath(file));
        setFocusAfterChooser(SOURCE_FIELD);
        onChoosingFileChange(false);
    }

    if (choosingFile) {
        return <FileChooser initialDir={chooserStart.dir} initialSelection={chooserStart.selection} width={width} height={height} onChoose={handleChoose}
            onCancel={() => onChoosingFileChange(false)} />;
    }

    return (
        <>
            <Form
                title="Add new torrent"
                fields={[
                    { label: "URL or file", value: source, onChange: setSource },
                    { label: "Choose file...", type: "button", onPress: openChooser },
                    { label: "Save path", value: savePath, onChange: setSavePath },
                    { label: "Start paused", type: "checkbox", value: startPaused, onChange: setStartPaused }
                ]}
                onSubmit={handleSubmit}
                initialFocusIndex={focusAfterChooser}
            />
            {loading && <Text color="yellow">Adding torrent...</Text>}
            {error && <Text color="red">{error}</Text>}
        </>
    );
}
