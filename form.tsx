import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface FormField {
    label: string;
    value: string;
    onChange: (value: string) => void;
    mask?: string;
}

interface FormProps {
    title: string;
    fields: FormField[];
    onSubmit?: () => void;
    initialFocusIndex?: number;
}

export function Form({ title, fields, onSubmit, initialFocusIndex = 0 }: FormProps) {
    const [focusIndex, setFocusIndex] = useState(initialFocusIndex);
    const maxLabel = Math.max(...fields.map((f) => f.label.length));

    useInput((_input, key) => {
        if (key.tab) {
            const dir = key.shift ? -1 : 1;
            setFocusIndex((prev) => (prev + dir + fields.length) % fields.length);
        }
    });

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>{title}</Text>
            <Box flexDirection="column">
                {fields.map((field, i) => (
                    <Box flexDirection="row" gap={1} key={field.label}>
                        <Text>{field.label.padStart(maxLabel)}:</Text>
                        <TextInput
                            value={field.value}
                            onChange={field.onChange}
                            focus={i === focusIndex}
                            mask={field.mask}
                            onSubmit={onSubmit}
                        />
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
