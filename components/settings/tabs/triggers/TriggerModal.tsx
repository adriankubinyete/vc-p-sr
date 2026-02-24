/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React } from "@webpack/common";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Trigger {
    id: string;
    name: string;
    keyword: string;
    enabled: boolean;
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
    body: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 12,
    },
    field: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 4,
    },
    label: {
        color: "var(--text-muted)",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
    },
    input: {
        background: "var(--background-secondary)",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: 4,
        color: "var(--text-normal)",
        fontSize: 14,
        padding: "8px 10px",
        outline: "none",
        width: "100%",
        boxSizing: "border-box" as const,
    },
    toggleRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
    },
    toggleLabel: {
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
    btnDanger: {
        padding: "8px 16px",
        borderRadius: 4,
        border: "none",
        background: "var(--red-400)",
        color: "#fff",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        marginRight: "auto",
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

// ─── Modal (modo Add e Edit compartilham o mesmo componente) ──────────────────

interface TriggerModalProps {
    modalProps: ModalProps;
    trigger?: Trigger; // undefined = modo Add, definido = modo Edit
    onSave?: (trigger: Trigger) => void;
    onDelete?: (triggerId: string) => void;
}

function TriggerModal({ modalProps, trigger, onSave, onDelete }: TriggerModalProps) {
    const isEditing = trigger !== undefined;

    const [name, setName] = React.useState(trigger?.name ?? "");
    const [keyword, setKeyword] = React.useState(trigger?.keyword ?? "");
    const [enabled, setEnabled] = React.useState(trigger?.enabled ?? true);

    const handleSave = () => {
        const saved: Trigger = {
            id: trigger?.id ?? crypto.randomUUID(),
            name: name.trim(),
            keyword: keyword.trim(),
            enabled,
        };
        onSave?.(saved);
        // TODO: persistir na sua store
        modalProps.onClose();
    };

    const handleDelete = () => {
        if (!trigger) return;
        onDelete?.(trigger.id);
        // TODO: remover da sua store
        modalProps.onClose();
    };

    const isValid = name.trim().length > 0 && keyword.trim().length > 0;

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalContent>
                <ModalCloseButton onClick={modalProps.onClose} />

                <div style={styles.header}>
                    <p style={styles.title}>{isEditing ? "Edit Trigger" : "Add Trigger"}</p>
                </div>

                <div style={styles.body}>
                    <div style={styles.field}>
                        <label style={styles.label}>Name</label>
                        <input
                            style={styles.input}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Boss Spawn"
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Keyword</label>
                        <input
                            style={styles.input}
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            placeholder='e.g. "boss has spawned"'
                        />
                    </div>

                    <div style={styles.toggleRow}>
                        <span style={styles.toggleLabel}>Enabled</span>
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={e => setEnabled(e.target.checked)}
                        />
                    </div>
                </div>

                <div style={styles.actions}>
                    {isEditing && (
                        <button style={styles.btnDanger} onClick={handleDelete}>
                            Delete
                        </button>
                    )}
                    <button style={styles.btnSecondary} onClick={modalProps.onClose}>
                        Cancel
                    </button>
                    <button style={styles.btnPrimary} onClick={handleSave} disabled={!isValid}>
                        {isEditing ? "Save" : "Add"}
                    </button>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

// ─── Exports de abertura ──────────────────────────────────────────────────────

export const openAddTriggerModal = (onSave?: (trigger: Trigger) => void) =>
    openModal(p => <TriggerModal modalProps={p} onSave={onSave} />);

export const openEditTriggerModal = (trigger: Trigger, onSave?: (trigger: Trigger) => void, onDelete?: (id: string) => void) =>
    openModal(p => <TriggerModal modalProps={p} trigger={trigger} onSave={onSave} onDelete={onDelete} />);
