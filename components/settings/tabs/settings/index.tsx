/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { settings } from "../../../../settings";

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = {
    container: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 4,
    },
    sectionTitle: {
        color: "var(--text-muted)",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        marginBottom: 4,
        marginTop: 16,
    },
    row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-secondary)",
    },
    rowLeft: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 2,
    },
    rowLabel: {
        color: "var(--text-normal)",
        fontSize: 14,
        fontWeight: 500,
    },
    rowDescription: {
        color: "var(--text-muted)",
        fontSize: 12,
    },
    select: {
        background: "var(--background-tertiary)",
        border: "none",
        borderRadius: 4,
        color: "var(--text-normal)",
        fontSize: 13,
        padding: "4px 8px",
        cursor: "pointer",
    },
};

// ─── Componentes auxiliares ───────────────────────────────────────────────────

interface ToggleRowProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
    return (
        <div style={styles.row}>
            <div style={styles.rowLeft}>
                <span style={styles.rowLabel}>{label}</span>
                {description && <span style={styles.rowDescription}>{description}</span>}
            </div>
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
            />
        </div>
    );
}

interface SelectRowProps<T extends string> {
    label: string;
    description?: string;
    value: T;
    options: { value: T; label: string; }[];
    onChange: (value: T) => void;
}

function SelectRow<T extends string>({ label, description, value, options, onChange }: SelectRowProps<T>) {
    return (
        <div style={styles.row}>
            <div style={styles.rowLeft}>
                <span style={styles.rowLabel}>{label}</span>
                {description && <span style={styles.rowDescription}>{description}</span>}
            </div>
            <select
                style={styles.select}
                value={value}
                onChange={e => onChange(e.target.value as T)}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}

// ─── Tab principal ────────────────────────────────────────────────────────────

export function SettingsTab() {
    const { autoJoinEnabled, notificationEnabled, pluginIconShortcutAction } = settings.use([
        "autoJoinEnabled",
        "notificationEnabled",
        "pluginIconShortcutAction",
    ]);

    return (
        <div style={styles.container}>

            {/* Seção: Comportamento */}
            <p style={styles.sectionTitle}>Behavior</p>

            <ToggleRow
                label="Auto-join"
                description="Automatically join channels when a trigger is matched."
                checked={autoJoinEnabled}
                onChange={v => (settings.store.autoJoinEnabled = v)}
            />

            <ToggleRow
                label="Notifications"
                description="Show a toast notification when a trigger is matched."
                checked={notificationEnabled}
                onChange={v => (settings.store.notificationEnabled = v)}
            />

            {/* Seção: Ícone */}
            <p style={styles.sectionTitle}>Icon Shortcut</p>

            <SelectRow
                label="Right-click action"
                description="What happens when you right-click the plugin icon."
                value={pluginIconShortcutAction}
                options={[
                    { value: "toggle_join", label: "Toggle Auto-join" },
                    { value: "toggle_notification", label: "Toggle Notifications" },
                    { value: "toggle_both", label: "Toggle Both" },
                    { value: "none", label: "Do nothing" },
                ]}
                onChange={v => (settings.store.pluginIconShortcutAction = v)}
            />

        </div>
    );
}
