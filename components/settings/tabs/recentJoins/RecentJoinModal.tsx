/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React } from "@webpack/common";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RecentJoin {
    id: string;
    username: string;
    userId: string;
    guildName: string;
    channelName: string;
    timestamp: number;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = {
    header: {
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: "1px solid var(--background-modifier-accent)",
    },
    title: {
        color: "var(--text-normal)",
        fontWeight: 700,
        fontSize: 18,
        margin: 0,
    },
    subtitle: {
        color: "var(--text-muted)",
        fontSize: 12,
        marginTop: 4,
    },
    body: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
    },
    row: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    },
    label: {
        color: "var(--text-muted)",
        fontSize: 12,
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
    },
    value: {
        color: "var(--text-normal)",
        fontSize: 14,
    },
    actions: {
        display: "flex",
        gap: 8,
        marginTop: 20,
        justifyContent: "flex-end",
    },
    btnPrimary: {
        padding: "8px 16px",
        borderRadius: 4,
        border: "none",
        background: "var(--brand-500)",
        color: "#fff",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
    },
    btnSecondary: {
        padding: "8px 16px",
        borderRadius: 4,
        border: "none",
        background: "var(--background-secondary)",
        color: "var(--text-normal)",
        cursor: "pointer",
        fontSize: 14,
    },
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface RecentJoinModalProps {
    modalProps: ModalProps;
    join: RecentJoin;
}

function RecentJoinModal({ modalProps, join }: RecentJoinModalProps) {
    const formattedDate = new Date(join.timestamp).toLocaleString();

    const handleJoin = () => {
        // TODO: lógica de join no canal
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalContent>
                <ModalCloseButton onClick={modalProps.onClose} />

                <div style={styles.header}>
                    <p style={styles.title}>{join.username}</p>
                    <p style={styles.subtitle}>Joined {formattedDate}</p>
                </div>

                <div style={styles.body}>
                    <div style={styles.row}>
                        <span style={styles.label}>User ID</span>
                        <span style={styles.value}>{join.userId}</span>
                    </div>
                    <div style={styles.row}>
                        <span style={styles.label}>Server</span>
                        <span style={styles.value}>{join.guildName}</span>
                    </div>
                    <div style={styles.row}>
                        <span style={styles.label}>Channel</span>
                        <span style={styles.value}>#{join.channelName}</span>
                    </div>
                </div>

                <div style={styles.actions}>
                    <button style={styles.btnSecondary} onClick={modalProps.onClose}>
                        Close
                    </button>
                    <button style={styles.btnPrimary} onClick={handleJoin}>
                        Join Channel
                    </button>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

// ─── Export de abertura ───────────────────────────────────────────────────────

export const openRecentJoinModal = (join: RecentJoin) =>
    openModal(p => <RecentJoinModal modalProps={p} join={join} />);
