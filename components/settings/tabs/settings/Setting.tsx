/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { OptionType } from "@utils/types";
import { React } from "@webpack/common";

import { settings } from "../../../../settings";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsKey = keyof typeof settings.def;

export type SettingProps = {
    id: SettingsKey;
    label: string; // always required — no auto-guessing from def.description
    description?: string; // shown below the control as a hint
    disabled?: boolean;
    style?: React.CSSProperties;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
    row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-secondary)",
    } as React.CSSProperties,

    rowStacked: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-secondary)",
    } as React.CSSProperties,

    rowLeft: {
        display: "flex",
        flexDirection: "column",
        gap: 3,
        flex: 1,
        minWidth: 0,
    } as React.CSSProperties,

    label: {
        color: "var(--text-normal)",
        fontSize: 14,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
    } as React.CSSProperties,

    description: {
        color: "var(--text-muted)",
        fontSize: 12,
        lineHeight: 1.4,
        marginTop: 2,
    } as React.CSSProperties,

    restartBadge: {
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-warning)",
        background: "hsl(38deg 95% 54% / 15%)",
        border: "1px solid hsl(38deg 95% 54% / 30%)",
        borderRadius: 4,
        padding: "1px 5px",
        letterSpacing: "0.04em",
        flexShrink: 0,
    } as React.CSSProperties,

    toggle: {
        width: 36,
        height: 20,
        flexShrink: 0,
        cursor: "pointer",
        accentColor: "var(--brand-500)",
    } as React.CSSProperties,

    select: {
        background: "var(--background-tertiary)",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: 4,
        color: "var(--text-normal)",
        fontSize: 13,
        padding: "5px 8px",
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: 240,
    } as React.CSSProperties,

    input: {
        background: "var(--background-tertiary)",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: 4,
        color: "var(--text-normal)",
        fontSize: 13,
        padding: "6px 8px",
        width: "100%",
        boxSizing: "border-box",
        marginTop: 8,
        outline: "none",
    } as React.CSSProperties,

    error: {
        color: "var(--text-danger)",
        fontSize: 11,
        marginTop: 4,
    } as React.CSSProperties,
};

// ─── Controls ─────────────────────────────────────────────────────────────────

// Lazy getter — não acessa settings.store no module scope, só em render time
const s = () => settings.store as Record<string, any>;

function BooleanControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const value = settings.use([id])[id] as boolean;
    return (
        <input
            type="checkbox"
            style={S.toggle}
            checked={!!value}
            disabled={disabled}
            onChange={e => (s()[id] = e.target.checked)}
        />
    );
}

function SelectControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const def = settings.def[id] as any;
    const value = settings.use([id])[id];
    const options: { label: string; value: any; }[] = def.options ?? [];

    return (
        <select
            style={S.select}
            value={value as string}
            disabled={disabled}
            onChange={e => (s()[id] = e.target.value)}
        >
            {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}

function StringControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const stored = settings.use([id])[id] as string ?? "";
    const [raw, setRaw] = React.useState(stored);

    React.useEffect(() => setRaw(stored), [stored]);

    const commit = React.useCallback((v: string) => {
        s()[id] = v;
    }, [id]);

    React.useEffect(() => {
        if (raw === stored) return;
        const t = setTimeout(() => commit(raw), 400);
        return () => clearTimeout(t);
    }, [raw]);

    return (
        <input
            type="text"
            style={S.input}
            value={raw}
            disabled={disabled}
            placeholder={disabled ? "" : "Enter value..."}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => commit(raw)}
        />
    );
}

function NumberControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const def = settings.def[id] as any;
    const value = settings.use([id])[id] as number;

    const [raw, setRaw] = React.useState(String(value ?? ""));
    const [errMsg, setErrMsg] = React.useState<string | null>(null);

    React.useEffect(() => setRaw(String(value ?? "")), [value]);

    const validate = (v: string): string | null => {
        const n = Number(v);
        if (isNaN(n)) return "Must be a number";
        if (def.min != null && n < def.min) return `Min: ${def.min}`;
        if (def.max != null && n > def.max) return `Max: ${def.max}`;
        return null;
    };

    const commit = (v: string) => {
        const err = validate(v);
        setErrMsg(err);
        if (!err) s()[id] = Number(v);
    };

    return (
        <>
            <input
                type="number"
                style={{ ...S.input, borderColor: errMsg ? "var(--text-danger)" : undefined }}
                value={raw}
                disabled={disabled}
                min={def.min}
                max={def.max}
                onChange={e => { setRaw(e.target.value); commit(e.target.value); }}
            />
            {errMsg && <span style={S.error}>{errMsg}</span>}
        </>
    );
}

// ─── Setting ──────────────────────────────────────────────────────────────────

export function Setting({ id, label, description, disabled, style }: SettingProps) {
    const def = settings.def[id] as any;
    if (!def) return null;

    const restartNeeded = !!def.restartNeeded;
    const isInline = def.type === OptionType.BOOLEAN || def.type === OptionType.SELECT;

    const labelNode = (
        <span style={S.label}>
            {label}
            {restartNeeded && <span style={S.restartBadge}>restart</span>}
        </span>
    );

    let control: React.ReactNode;
    switch (def.type) {
        case OptionType.BOOLEAN: control = <BooleanControl id={id} disabled={disabled} />; break;
        case OptionType.SELECT: control = <SelectControl id={id} disabled={disabled} />; break;
        case OptionType.STRING: control = <StringControl id={id} disabled={disabled} />; break;
        case OptionType.NUMBER: control = <NumberControl id={id} disabled={disabled} />; break;
        default: return null;
    }

    if (isInline) {
        return (
            <div style={{ ...S.row, opacity: disabled ? 0.5 : 1, ...style }}>
                <div style={S.rowLeft}>
                    {labelNode}
                    {description && <span style={S.description}>{description}</span>}
                </div>
                {control}
            </div>
        );
    }

    return (
        <div style={{ ...S.rowStacked, opacity: disabled ? 0.5 : 1, ...style }}>
            {labelNode}
            {description && <span style={S.description}>{description}</span>}
            {control}
        </div>
    );
}
