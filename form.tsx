import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Checkbox } from "./checkbox.js";

interface TextFormField {
    type?: "text";
    label: string;
    value: string;
    onChange: (value: string) => void;
    mask?: string;
}

interface CheckboxFormField {
    type: "checkbox";
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
}

interface ButtonFormField {
    type: "button";
    label: string;
    onPress: () => void;
}

export type FormField = TextFormField | CheckboxFormField | ButtonFormField;

function Button({ label, focus, onPress }: { label: string; focus: boolean; onPress: () => void }) {
    useInput((input, key) => {
        if (key.return || input === " ") onPress();
    }, { isActive: focus });

    return <Text inverse={focus}>[ {label} ]</Text>;
}

interface FormProps {
    title: string;
    fields: FormField[];
    onSubmit?: () => void;
    initialFocusIndex?: number;
}

export function Form({ title, fields, onSubmit, initialFocusIndex = 0 }: FormProps) {
    const [focusIndex, setFocusIndex] = useState(initialFocusIndex);
    // Buttons show their label on the button, not in the label column
    const maxLabel = Math.max(...fields.map((f) => f.type === "button" ? 0 : f.label.length));

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
                        {/* Long values wrap rather than squeezing the label */}
                        <Box flexShrink={0}>
                            <Text>{field.type === "button" ? " ".repeat(maxLabel + 1) : field.label.padStart(maxLabel) + ":"}</Text>
                        </Box>
                        {field.type === "button" ? (
                            <Button label={field.label} focus={i === focusIndex} onPress={field.onPress} />
                        ) : field.type === "checkbox" ? (
                            <Checkbox value={field.value} onChange={field.onChange} focus={i === focusIndex} onSubmit={onSubmit} />
                        ) : (
                            <TextInput
                                value={field.value}
                                onChange={field.onChange}
                                focus={i === focusIndex}
                                mask={field.mask}
                                onSubmit={onSubmit}
                            />
                        )}
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
