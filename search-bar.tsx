import { useState } from "react";
import { Box, Text, useInput } from "ink";

interface LineInputProps {
    value: string;
    onChange: (value: string) => void;
    width: number;
}

// Single-line text input that scrolls horizontally to keep the cursor visible. (ink-text-input
// wraps instead, so the end of a long query, where you're typing, ends up cut off.)
// Enter, Esc and ↑↓ are left to other handlers.
function LineInput({ value, onChange, width }: LineInputProps) {
    const [cursor, setCursor] = useState(value.length);
    const pos = Math.min(cursor, value.length);

    useInput((input, key) => {
        if (key.leftArrow) {
            setCursor(Math.max(0, pos - 1));
        } else if (key.rightArrow) {
            setCursor(Math.min(value.length, pos + 1));
        } else if (key.home) {
            setCursor(0);
        } else if (key.end) {
            setCursor(value.length);
        } else if (key.backspace || key.delete) {
            if (pos > 0) {
                onChange(value.slice(0, pos - 1) + value.slice(pos));
                setCursor(pos - 1);
            }
        } else if (input && !key.ctrl && !key.meta && !key.return && !key.escape && !key.tab) {
            const text = input.replace(/[\r\n]+/g, " ");
            onChange(value.slice(0, pos) + text + value.slice(pos));
            setCursor(pos + text.length);
        }
    });

    // Scroll so the cursor (which takes a cell of its own at the end) stays in view
    const start = Math.max(0, pos + 1 - width);
    const before = value.slice(start, pos);
    const atCursor = value[pos] ?? " ";
    const after = value.slice(pos + 1, start + width);

    return <Text>{before}<Text inverse>{atCursor}</Text>{after}</Text>;
}

interface SearchBarProps {
    editing: boolean;
    query: string;
    onChange: (query: string) => void;
    matchCount: number;
    totalCount: number;
    screenWidth: number;
}

function truncate(text: string, width: number): string {
    if (width <= 0) return "";
    return text.length > width ? text.slice(0, width - 1) + "…" : text;
}

// While editing: an input line ("/query") with a live match count. Once applied: a highlighted
// bar so it's obvious the list is filtered. Enter and Esc are handled by the app.
export function SearchBar({ editing, query, onChange, matchCount, totalCount, screenWidth }: SearchBarProps) {
    const count = `${matchCount} of ${totalCount}`;

    if (editing) {
        const inputWidth = Math.max(1, screenWidth - 1 - (count.length + 1));
        return (
            <Box width={screenWidth}>
                <Text>/</Text>
                <Box width={inputWidth} flexShrink={0}>
                    <LineInput value={query} onChange={onChange} width={inputWidth} />
                </Box>
                <Box flexGrow={1} />
                <Text> {count}</Text>
            </Box>
        );
    }

    const line = truncate(` Filter: ${query.trim()}  ·  ${count}`, screenWidth);
    return <Text backgroundColor="yellow" color="black">{line.padEnd(screenWidth)}</Text>;
}
