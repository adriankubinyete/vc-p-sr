/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { openAddTriggerModal, openEditTriggerModal, Trigger } from "./TriggerModal";

// ─── Mock data — substitua pela sua store/state real ─────────────────────────

const MOCK_TRIGGERS: Trigger[] = [
    { id: "1", name: "Boss Spawn", keyword: "boss has spawned", enabled: true },
    { id: "2", name: "Rare Item", keyword: "rare item dropped", enabled: false },
];

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = {
    container: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 8,
    },
    header: {
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: 4,
    },
    btnAdd: {
        padding: "7px 14px",
        borderRadius: 4,
        border: "none",
        background: "var(--brand-500)",
        color: "#fff",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
    },
    empty: {
        color: "var(--text-muted)",
        textAlign: "center" as const,
        marginTop: 32,
    },
    card: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-secondary)",
        cursor: "pointer",
        border: "1px solid transparent",
        transition: "border-color 0.15s, background 0.15s",
    },
    cardLeft: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 2,
    },
    triggerName: {
        color: "var(--text-normal)",
        fontWeight: 600,
        fontSize: 14,
    },
    keyword: {
        color: "var(--text-muted)",
        fontSize: 12,
        fontFamily: "monospace",
    },
    badge: (enabled: boolean): React.CSSProperties => ({
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: enabled ? "var(--green-360)" : "var(--background-modifier-accent)",
        color: enabled ? "#fff" : "var(--text-muted)",
    }),
};

// ─── Card individual ──────────────────────────────────────────────────────────

function TriggerCard({ trigger }: { trigger: Trigger; }) {
    return (
        <div
            style={styles.card}
            onClick={() => openEditTriggerModal(trigger)}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--brand-500)";
                (e.currentTarget as HTMLDivElement).style.background = "var(--background-modifier-hover)";
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                (e.currentTarget as HTMLDivElement).style.background = "var(--background-secondary)";
            }}
        >
            <div style={styles.cardLeft}>
                <span style={styles.triggerName}>{trigger.name}</span>
                <span style={styles.keyword}>"{trigger.keyword}"</span>
            </div>
            <span style={styles.badge(trigger.enabled)}>
                {trigger.enabled ? "ON" : "OFF"}
            </span>
        </div>
    );
}

// ─── Tab principal ────────────────────────────────────────────────────────────

export function TriggersTab() {
    // Substitua MOCK_TRIGGERS pela sua store/state real
    const triggers = MOCK_TRIGGERS;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button style={styles.btnAdd} onClick={() => openAddTriggerModal()}>
                    + Add Trigger
                </button>
            </div>

            {triggers.length === 0
                ? <p style={styles.empty}>No triggers configured. Click "+ Add Trigger" to create one.</p>
                : triggers.map(trigger => (
                    <TriggerCard key={trigger.id} trigger={trigger} />
                ))
            }
        </div>
    );
}
