/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React } from "@webpack/common";

import { RecentJoinsTab } from "./tabs/recentJoins";
import { SettingsTab } from "./tabs/settings";
import { TriggersTab } from "./tabs/triggers";

// ─── Definição das tabs ────────────────────────────────────────────────────────

type TabId = "recentJoins" | "triggers" | "settings";

interface Tab {
    id: TabId;
    label: string;
    component: React.ComponentType;
}

const TABS: Tab[] = [
    { id: "recentJoins", label: "Recent Joins", component: RecentJoinsTab },
    { id: "triggers", label: "Triggers", component: TriggersTab },
    { id: "settings", label: "Settings", component: SettingsTab },
];

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = {
    root: {
        display: "flex",
        flexDirection: "column" as const,
        minHeight: 420,
    },
    tabBar: {
        display: "flex",
        gap: 2,
        borderBottom: "2px solid var(--background-modifier-accent)",
        marginBottom: 16,
    },
    tabBtn: (active: boolean): React.CSSProperties => ({
        background: "none",
        border: "none",
        borderBottom: active
            ? "2px solid var(--brand-500)"
            : "2px solid transparent",
        marginBottom: -2,
        padding: "8px 14px",
        color: active ? "var(--text-normal)" : "var(--text-muted)",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        fontSize: 14,
        transition: "color 0.15s, border-color 0.15s",
    }),
    content: {
        flex: 1,
        overflowY: "auto" as const,
    },
};

// ─── Modal principal ──────────────────────────────────────────────────────────

interface SolsRadarModalProps {
    modalProps: ModalProps;
    initialTab?: TabId;
}

export function SolsRadarModal({ modalProps, initialTab = "recentJoins" }: SolsRadarModalProps) {
    const [activeTab, setActiveTab] = React.useState<TabId>(initialTab);

    const ActiveComponent = TABS.find(t => t.id === activeTab)!.component;

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalContent>
                <ModalCloseButton onClick={modalProps.onClose} />

                <div style={styles.root}>
                    {/* Tab bar */}
                    <div style={styles.tabBar}>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                style={styles.tabBtn(activeTab === tab.id)}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Conteúdo da tab ativa */}
                    <div style={styles.content}>
                        <ActiveComponent />
                    </div>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

// ─── Helper de abertura ───────────────────────────────────────────────────────
//
// Use em qualquer lugar:
//   openSolsRadarModal()               → abre em Recent Joins
//   openSolsRadarModal("triggers")     → abre direto em Triggers
//   openSolsRadarModal("settings")     → abre direto em Settings

export const openSolsRadarModal = (initialTab?: TabId) =>
    openModal(p => <SolsRadarModal modalProps={p} initialTab={initialTab} />);
