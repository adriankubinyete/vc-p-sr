/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Logger } from "@utils/Logger";
import { React, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import {
    deleteTrigger,
    downloadTriggersJson,
    importTriggersFromJson,
    reorderTriggers,
    toggleTrigger,
    Trigger,
    TriggerType,
    useTriggers,
} from "../../../../stores/TriggerStore";
import { Pill, PillVariant } from "../../../Pill";
import { openAddTriggerModal, openEditTriggerModal } from "./TriggerModal";

const logger = new Logger("SolRadar");

// ─── Helpers visuais ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TriggerType, string> = {
    RARE_BIOME: "Rare Biome",
    EVENT_BIOME: "Event Biome",
    BIOME: "Biome",
    WEATHER: "Weather",
    MERCHANT: "Merchant",
    CUSTOM: "Custom",
};

const TYPE_PILL_VARIANT: Record<TriggerType, PillVariant> = {
    RARE_BIOME: "red",
    EVENT_BIOME: "green",
    BIOME: "pink",
    WEATHER: "blue",
    MERCHANT: "yellow",
    CUSTOM: "muted",
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
    toolbar: {
        flexShrink: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 8,
        marginBottom: 12,
        gap: 8,
    },
    toolbarRight: { display: "flex", gap: 6 },
    wrapper: {
        display: "flex",
        flexDirection: "column" as const,
        height: "100%",
        minHeight: 0,
    },
    list: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 6,
    },
    empty: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        textAlign: "center" as const,
        minHeight: 200,
    },
    container: {
        flex: 1,
        overflowY: "auto" as const,
        minHeight: 0,
        scrollbarColor: "var(--text-muted) transparent",
        scrollbarWidth: "thin" as const,
        scrollMarginLeft: 8,
    },

    // Card: mesma abordagem do JoinCard — borda + fundo derivados do estado
    card: (enabled: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        cursor: "pointer",
        userSelect: "none",
        transition: "filter 0.1s",
        background: enabled
            ? "color-mix(in srgb, var(--green-360) 6%, var(--background-secondary))"
            : "var(--background-secondary)",
        border: `1px solid ${enabled
            ? "color-mix(in srgb, var(--green-360) 25%, transparent)"
            : "var(--background-mod-normal)"}`,
    }),

    orderButtons: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 2,
        flexShrink: 0,
    },
    orderBtn: (disabled: boolean): React.CSSProperties => ({
        background: "none",
        border: "none",
        padding: "1px 4px",
        fontSize: 12,
        lineHeight: 1,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--text-muted)" : "var(--interactive-normal)",
        opacity: disabled ? 0.3 : 1,
        borderRadius: 3,
        transition: "color 0.1s, opacity 0.1s",
    }),

    cardIcon: {
        width: 36, height: 36, borderRadius: 8,
        flexShrink: 0, objectFit: "cover" as const,
    },
    cardIconPlaceholder: {
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        fontSize: 15, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.2s, color 0.2s",
    } as React.CSSProperties,

    cardBody: {
        flex: 1, display: "flex",
        flexDirection: "column" as const,
        gap: 3, minWidth: 0,
    },
    cardName: (enabled: boolean): React.CSSProperties => ({
        fontWeight: 600, fontSize: 14,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        color: enabled ? "var(--text-normal)" : "var(--text-muted)",
        transition: "color 0.2s",
    }),
    cardMeta: { display: "flex", alignItems: "center", gap: 6 },
    cardActions: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function TriggerCard({
    trigger,
    isFirst,
    isLast,
    shiftHeld,
    onMoveUp,
    onMoveDown,
}: {
    trigger: Trigger;
    isFirst: boolean;
    isLast: boolean;
    shiftHeld: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    const variant = TYPE_PILL_VARIANT[trigger.type];
    const label = TYPE_LABELS[trigger.type];
    const initial = trigger.name.charAt(0).toUpperCase();
    const { enabled } = trigger.state;

    const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <div
            style={s.card(enabled)}
            onClick={() => openEditTriggerModal(trigger)}
            onContextMenu={e => { e.preventDefault(); toggleTrigger(trigger.id); }}
            title="Left click to edit · Right click to toggle"
        >
            {/* Ordem */}
            <div style={s.orderButtons} onClick={stopPropagation} onContextMenu={stopPropagation}>
                <button style={s.orderBtn(isFirst)} disabled={isFirst} onClick={onMoveUp} title="Move up">▲</button>
                <button style={s.orderBtn(isLast)} disabled={isLast} onClick={onMoveDown} title="Move down">▼</button>
            </div>

            {/* Ícone */}
            {trigger.iconUrl
                ? <img src={trigger.iconUrl} alt="" style={s.cardIcon} />
                : <div
                    className={`vc-sora-pill-base vc-sora-pill-${enabled ? variant : "muted"}`}
                    style={{ ...s.cardIconPlaceholder, borderRadius: 8, whiteSpace: "unset" }}
                >
                    {initial}
                </div>
            }

            {/* Info */}
            <div style={s.cardBody}>
                <span style={s.cardName(enabled)}>{trigger.name}</span>
                <div style={s.cardMeta}>
                    <Pill variant={enabled ? variant : "muted"} size="xs">
                        {label}
                    </Pill>
                    <Pill variant={enabled ? "brand" : "muted"} size="xs" title="Priority (lower = more important)">
                        ★ {trigger.state.priority}
                    </Pill>
                </div>
            </div>

            {/* Delete (só com shift) */}
            {shiftHeld && (
                <div onClick={stopPropagation} onContextMenu={stopPropagation}>
                    <Button variant="dangerPrimary" size="xs" onClick={() => deleteTrigger(trigger.id)} title="Delete trigger">
                        Delete
                    </Button>
                </div>
            )}
        </div>
    );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function TriggersTab() {
    const triggers = useTriggers();
    const importRef = useRef<HTMLInputElement>(null);
    const [shiftHeld, setShiftHeld] = useState(false);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(true); };
        const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false); };
        const onBlur = () => setShiftHeld(false);

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, []);

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

    const move = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= triggers.length) return;
        logger.info(`Moving trigger "${triggers[fromIndex].name}" from ${fromIndex} to ${toIndex}`);
        const newOrder = [...triggers];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);
        reorderTriggers(newOrder);
    };

    return (
        <div style={s.wrapper}>
            <div style={s.container}>
                {triggers.length === 0
                    ? (
                        <div style={s.empty}>
                            <Paragraph size="sm">
                                No triggers yet. Create a new trigger or import some from a file!
                            </Paragraph>
                        </div>
                    )
                    : (
                        <div style={s.list}>
                            {triggers.map((t, i) => (
                                <TriggerCard
                                    key={t.id}
                                    trigger={t}
                                    isFirst={i === 0}
                                    isLast={i === triggers.length - 1}
                                    shiftHeld={shiftHeld}
                                    onMoveUp={() => move(i, i - 1)}
                                    onMoveDown={() => move(i, i + 1)}
                                />
                            ))}
                        </div>
                    )
                }
            </div>

            <div style={s.toolbar}>
                <Paragraph>{triggers.length} trigger{triggers.length !== 1 ? "s" : ""}</Paragraph>
                <div style={s.toolbarRight}>
                    <Button size="small" variant="secondary" onClick={downloadTriggersJson}>Export</Button>
                    <Button size="small" variant="secondary" onClick={() => importRef.current?.click()}>Import</Button>
                    <Button size="small" variant="primary" onClick={openAddTriggerModal}>+ New Trigger</Button>
                </div>
            </div>

            <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={handleImport}
            />
        </div>
    );
}
