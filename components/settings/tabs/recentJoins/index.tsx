/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { openRecentJoinModal, RecentJoin } from "./RecentJoinModal";

// ─── Mock data — substitua pela sua fonte de dados real ───────────────────────

const MOCK_JOINS: RecentJoin[] = [
    { id: "1", username: "PlayerOne", userId: "123456789", guildName: "Sol's RNG", channelName: "boss-alerts", timestamp: Date.now() - 60_000 },
    { id: "2", username: "PlayerTwo", userId: "987654321", guildName: "Sol's RNG", channelName: "boss-alerts", timestamp: Date.now() - 300_000 },
];

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = {
    container: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 8,
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
    username: {
        color: "var(--text-normal)",
        fontWeight: 600,
        fontSize: 14,
    },
    meta: {
        color: "var(--text-muted)",
        fontSize: 12,
    },
    timestamp: {
        color: "var(--text-muted)",
        fontSize: 11,
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Card individual ──────────────────────────────────────────────────────────

function RecentJoinCard({ join }: { join: RecentJoin; }) {
    return (
        <div
            style={styles.card}
            onClick={() => openRecentJoinModal(join)}
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
                <span style={styles.username}>{join.username}</span>
                <span style={styles.meta}>{join.guildName} · #{join.channelName}</span>
            </div>
            <span style={styles.timestamp}>{formatRelativeTime(join.timestamp)}</span>
        </div>
    );
}

// ─── Tab principal ────────────────────────────────────────────────────────────

export function RecentJoinsTab() {
    // Substitua MOCK_JOINS pela sua store/state real
    const joins = MOCK_JOINS;

    if (joins.length === 0) {
        return <p style={styles.empty}>No recent joins yet.</p>;
    }

    return (
        <div style={styles.container}>
            {joins.map(join => (
                <RecentJoinCard key={join.id} join={join} />
            ))}
        </div>
    );
}
