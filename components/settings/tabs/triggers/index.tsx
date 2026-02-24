/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { React, showToast, Toasts, useRef } from "@webpack/common";

import {
    downloadTriggersJson,
    importTriggersFromJson,
    toggleTrigger,
    Trigger,
    TriggerType,
    useTriggers,
} from "../../../../stores/TriggerStore";
import { openAddTriggerModal, openEditTriggerModal } from "./TriggerModal";

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TriggerType, string> = {
    BIOME: "Biome",
    RARE_BIOME: "Rare Biome",
    WEATHER: "Weather",
    MERCHANT: "Merchant",
    CUSTOM: "Custom",
};

const TYPE_COLORS: Record<TriggerType, string> = {
    BIOME: "var(--blue-345)",
    RARE_BIOME: "var(--pink-400)",
    WEATHER: "var(--green-360)",
    MERCHANT: "var(--yellow-300)",
    CUSTOM: "var(--text-muted)",
};

// ─── Estilos — só layout de card e lista, sem equivalente nativo ──────────────

const s = {
    toolbar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
        gap: 8,
    },
    toolbarRight: { display: "flex", gap: 6 },
    list: { display: "flex", flexDirection: "column" as const, gap: 8 },
    empty: { textAlign: "center" as const, marginTop: 40 },

    card: (enabled: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: enabled ? "rgba(67, 162, 90, 0.10)" : "var(--background-secondary)",
        border: `1px solid ${enabled ? "rgba(67, 162, 90, 0.30)" : "var(--background-modifier-accent)"}`,
        transition: "background 0.2s, border-color 0.2s",
    }),
    cardIcon: {
        width: 36, height: 36, borderRadius: 8,
        flexShrink: 0, objectFit: "cover" as const,
    },
    cardIconPlaceholder: (color: string): React.CSSProperties => ({
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: color, color: "#fff",
        fontSize: 15, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
    }),
    cardBody: {
        flex: 1, display: "flex", flexDirection: "column" as const,
        gap: 2, minWidth: 0,
    },
    cardName: {
        color: "var(--text-normal)", fontWeight: 600, fontSize: 14,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
    },
    cardType: (color: string): React.CSSProperties => ({
        display: "inline-block",
        padding: "1px 8px", borderRadius: 999,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color, fontSize: 11, fontWeight: 700, alignSelf: "flex-start",
    }),
    cardActions: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function TriggerCard({ trigger }: { trigger: Trigger; }) {
    const color = TYPE_COLORS[trigger.type];
    const label = TYPE_LABELS[trigger.type];
    const initial = trigger.name.charAt(0).toUpperCase();

    return (
        <div style={s.card(trigger.state.enabled)}>
            {trigger.icon_url
                ? <img src={trigger.icon_url} alt="" style={s.cardIcon} />
                : <div style={s.cardIconPlaceholder(color)}>{initial}</div>
            }

            <div style={s.cardBody}>
                <span style={s.cardName}>{trigger.name}</span>
                <span style={s.cardType(color)}>{label}</span>
            </div>

            <div style={s.cardActions}>
                {/* Toggle ON/OFF — positive quando ativo, secondary outline quando inativo */}
                <Button
                    size="small"
                    variant={trigger.state.enabled ? "positive" : "secondary"}
                    onClick={() => toggleTrigger(trigger.id)}
                >
                    {trigger.state.enabled ? "ON" : "OFF"}
                </Button>

                <Button
                    size="small"
                    variant="secondary"
                    onClick={() => openEditTriggerModal(trigger)}
                >
                    Edit
                </Button>
            </div>
        </div>
    );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function TriggersTab() {
    const triggers = useTriggers();
    const importRef = useRef<HTMLInputElement>(null);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            const result = await importTriggersFromJson(ev.target?.result as string, "merge");
            if (result.ok) showToast(`Imported ${result.imported} trigger(s)!`, Toasts.Type.SUCCESS);
            else showToast(`Import failed: ${result.error}`, Toasts.Type.FAILURE);
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    return (
        <div>
            <div style={s.toolbar}>
                <Paragraph>{triggers.length} trigger{triggers.length !== 1 ? "s" : ""}</Paragraph>

                <div style={s.toolbarRight}>
                    <Button size="small" variant="secondary" onClick={downloadTriggersJson}>
                        Export
                    </Button>
                    <Button size="small" variant="secondary" onClick={() => importRef.current?.click()}>
                        Import
                    </Button>
                    <Button size="small" variant="primary" onClick={openAddTriggerModal}>
                        + Add Trigger
                    </Button>
                </div>
            </div>

            {/* Input de importação oculto */}
            <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={handleImport}
            />

            {/* Lista */}
            {triggers.length === 0
                ? (
                    <div style={s.empty}>
                        <Paragraph>
                            No triggers yet. Click "+ Add Trigger" or import a JSON file to get started.
                        </Paragraph>
                    </div>
                )
                : (
                    <div style={s.list}>
                        {triggers.map(t => <TriggerCard key={t.id} trigger={t} />)}
                    </div>
                )
            }
        </div>
    );
}
