/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/OrderSlot.css";

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Logger } from "@utils/Logger";
import { Alerts, React, ReactDOM, showToast, TextInput, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { settings } from "../../../settings";
import {
    deleteTrigger,
    downloadTriggersJson,
    downloadTriggersJsonRedacted,
    importTriggersFromJson,
    RedactField,
    reorderTriggers,
    toggleTrigger,
    Trigger,
    TriggerType,
    useTriggers,
} from "../../../stores/TriggerStore";
import { UIState } from "../../../stores/UIStateStore";
import defaultTriggers from "../../../triggers.json";
import { isDeveloper } from "../../../utils";
import { JoinLockBanner } from "../../JoinLockBanner";
import { DeleteButton } from "../../ui/buttons/DeleteButton";
import { QuickFilterBtn } from "../../ui/buttons/QuickFilterBtn";
import { DragHandle } from "../../ui/DragHandle";
import { Pill, PillBorder, PillRadius, PillVariant } from "../../ui/Pill";
import { confirmWebhookThenRun } from "./exportActions";
import { PublicExportOptions } from "./PublicExportOptions";
import { openTriggerContextMenu } from "./TriggerContextMenu";
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

// ─── Query parser ─────────────────────────────────────────────────────────────

interface ParsedQuery {
    text: string;
    enabled: boolean | null;
    autojoin: boolean | null;
    notify: boolean | null;
    lock: boolean | null;
    priority: { op: "eq" | "gt" | "lt"; value: number; } | null;
}

function parseBool(v: string): boolean | null {
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return null;
}

/**
 * Parses a query string into structured filters.
 * Supported tokens: enabled: join: notify: lock: priority: (=/>/<)
 * Everything else is treated as free-text search.
 */
function parseQuery(raw: string): ParsedQuery {
    const result: ParsedQuery = {
        text: "", enabled: null, autojoin: null,
        notify: null, lock: null, priority: null,
    };

    const TOKEN_RE = /(\w+):([^\s]+)/g;
    let freeText = raw;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(raw)) !== null) {
        const [full, key, val] = match;
        freeText = freeText.replace(full, "");

        switch (key.toLowerCase()) {
            case "enabled":
                result.enabled = parseBool(val); break;
            case "join":
                result.autojoin = parseBool(val); break;
            case "notify":
                result.notify = parseBool(val); break;
            case "lock":
                result.lock = parseBool(val); break;
            case "priority": {
                const gtMatch = /^>(\d+)$/.exec(val);
                const ltMatch = /^<(\d+)$/.exec(val);
                const eqMatch = /^(\d+)$/.exec(val);
                if (gtMatch) result.priority = { op: "gt", value: parseInt(gtMatch[1]) };
                else if (ltMatch) result.priority = { op: "lt", value: parseInt(ltMatch[1]) };
                else if (eqMatch) result.priority = { op: "eq", value: parseInt(eqMatch[1]) };
                break;
            }
        }
    }

    result.text = freeText.trim().toLowerCase();
    return result;
}

function applyQuery(triggers: Trigger[], q: ParsedQuery, typeFilter: TriggerType | "all"): Trigger[] {
    return triggers.filter(t => {
        if (typeFilter !== "all" && t.type !== typeFilter) return false;

        if (q.enabled !== null && t.state.enabled !== q.enabled) return false;
        if (q.autojoin !== null && t.state.autojoin !== q.autojoin) return false;
        if (q.notify !== null && t.state.notify !== q.notify) return false;
        if (q.lock !== null && t.state.joinlock !== q.lock) return false;

        if (q.priority !== null) {
            const p = t.state.priority;
            if (q.priority.op === "eq" && p !== q.priority.value) return false;
            if (q.priority.op === "gt" && p <= q.priority.value) return false;
            if (q.priority.op === "lt" && p >= q.priority.value) return false;
        }

        if (q.text) {
            const keywords = t.conditions.keywords.match.value.join(" ").toLowerCase();
            const haystack = `${t.name} ${t.description} ${keywords}`.toLowerCase();
            if (!haystack.includes(q.text)) return false;
        }

        return true;
    });
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = {
    wrapper: {
        display: "flex",
        flexDirection: "column" as const,
        height: "100%",
        minHeight: 0,
        gap: 8,
    },
    filters: {
        flexShrink: 0,
        display: "flex",
        flexDirection: "column" as const,
        gap: 6,
    },
    quickFilters: {
        display: "flex",
        gap: 4,
        flexWrap: "wrap" as const,
    },
    container: {
        flex: 1,
        overflowY: "auto" as const,
        minHeight: 0,
        scrollbarColor: "var(--text-muted) transparent",
        scrollbarWidth: "thin" as const,
    },
    list: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 6,
    },
    empty: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        textAlign: "center" as const,
        minHeight: 200,
    },
    toolbar: {
        flexShrink: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
        gap: 8,
    },
    toolbarRight: { display: "flex", gap: 6 },

    // Card
    card: (enabled: boolean): React.CSSProperties => ({
        borderRadius: 8,
        cursor: "pointer",
        userSelect: "none",
        overflow: "hidden",
        transition: "filter 0.1s",
        // new
        // background: enabled
        //     ? "color-mix(in srgb, var(--green-360) 6%, var(--background-secondary))"
        //     : "var(--background-secondary)",
        // border: `1px solid ${enabled
        //     ? "color-mix(in srgb, var(--green-360) 25%, transparent)"
        //     : "var(--background-mod-normal)"}`,
        // old
        background: enabled
            ? "rgba(59, 165, 92, 0.1)"
            : "rgba(67, 67, 67, 0.1)",
        border: `1px solid ${enabled
            ? "rgba(59, 165, 92, 0.3)"
            : "rgba(255, 255, 255, 0.1)"}`,
    }),
    cardMain: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
    },
    dragGhost: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-secondary)",
        border: "1px solid var(--background-modifier-accent)",
    } as React.CSSProperties,
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
        color: disabled ? "var(--control-secondary-text-default)" : "var(--text-muted)",
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
        color: enabled ? "var(--control-secondary-text-default)" : "var(--text-muted)",
        transition: "color 0.2s",
    }),
    cardMeta: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const },
    cardDescription: {
        fontSize: 12,
        color: "var(--text-muted)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
        marginTop: 2,
    },
    cardFooter: {
        borderTop: "1px solid var(--background-mod-normal)",
        padding: "5px 14px",
        display: "flex",
        gap: 6,
        flexWrap: "wrap" as const,
        alignItems: "center",
    },
    deleteBtn: (): React.CSSProperties => ({
        background: "none",
        border: "none",
        padding: "4px 8px",
        borderRadius: 4,
        cursor: "pointer",
        color: "var(--control-critical-primary-text-default)",
        fontSize: 13,
        fontWeight: 600,
        opacity: 0.7,
        transition: "opacity 0.1s",
    }),
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function TriggerCard({
    trigger,
    index,
    isFirst,
    isLast,
    shiftHeld,
    orderingDisabled,
    legacyMouseBehavior,
    isDragging,
    onMoveUp,
    onMoveDown,
    onDragHandleDown,
}: {
    trigger: Trigger;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    shiftHeld: boolean;
    orderingDisabled: boolean;
    legacyMouseBehavior: boolean;
    isDragging: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDragHandleDown: (e: React.PointerEvent, cardRect: DOMRect) => void;
}) {
    const variant = TYPE_PILL_VARIANT[trigger.type];
    const label = TYPE_LABELS[trigger.type];
    const initial = trigger.name.charAt(0).toUpperCase();
    const [hovered, setHovered] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const { enabled, autojoin, notify, joinlock, joinlockDuration, priority } = trigger.state;
    const { forwarding } = trigger;
    const { bypassMonitoredOnly, bypassIgnoredChannels, bypassIgnoredGuilds, bypassMatchAmbiguity, bypassLinkVerification } = trigger.conditions;
    const hasAnyBypass = bypassMonitoredOnly || bypassIgnoredChannels || bypassIgnoredGuilds || bypassMatchAmbiguity || bypassLinkVerification;

    const PILL_BORDER_STYLE: PillBorder = "subtle";
    const PILL_RADIUS_STYLE: PillRadius = "xs";

    const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

    const canReorder = !orderingDisabled;

    return (
        <div
            ref={cardRef}
            data-trigger-index={index}
            style={{
                ...s.card(enabled),
                filter: hovered && !isDragging ? "brightness(1.1)" : "none",
                ...(isDragging && {
                    border: "2px dashed var(--text-muted)",
                    background: "var(--background-modifier-selected, var(--background-secondary-alt))",
                }),
            }}
            onClick={() => openEditTriggerModal(trigger)}
            onContextMenu={e => {
                e.preventDefault();
                if (legacyMouseBehavior) toggleTrigger(trigger.id);
                else openTriggerContextMenu(e, trigger);
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={legacyMouseBehavior
                ? `${trigger.name} · Left click to edit · Right click to toggle trigger`
                : `${trigger.name} · Left click to edit · Right click for more options`}
        >
            {/* Main row */}
            <div style={{ ...s.cardMain, visibility: isDragging ? "hidden" : "visible" }}>
                {/* Ordem */}
                {canReorder && (legacyMouseBehavior ? (
                    <div
                        className={`vc-sora-orderslot${hovered ? " visible" : ""}`}
                        style={s.orderButtons}
                        onClick={stopPropagation}
                        onContextMenu={stopPropagation}
                    >
                        <button style={s.orderBtn(isFirst)} disabled={isFirst} onClick={onMoveUp} title="Move this card up">▲</button>
                        <button style={s.orderBtn(isLast)} disabled={isLast} onClick={onMoveDown} title="Move this card down">▼</button>
                    </div>
                ) : (
                    <DragHandle
                        visible={hovered}
                        onPointerDownHandle={e => {
                            if (cardRef.current) onDragHandleDown(e, cardRef.current.getBoundingClientRect());
                        }}
                        onMoveUp={onMoveUp}
                        onMoveDown={onMoveDown}
                    />
                ))}

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
                    {/* <div style={s.cardMeta}>
                        <Pill radius="none" variant={enabled ? variant : "muted"} size="xs">{label}</Pill>
                    </div> */}
                    {trigger.description && (
                        <div style={s.cardDescription} title={trigger.description}>
                            {trigger.description}
                        </div>
                    )}
                </div>

                {/* Delete (só com shift) */}
                {shiftHeld && <DeleteButton
                    onClick={() => deleteTrigger(trigger.id)}
                    visible={hovered}
                    hint="Delete this trigger"
                />}

                <span style={{
                    color: "var(--text-muted)",
                    fontSize: 18,
                    flexShrink: 0,
                    alignSelf: "center"
                }}>
                    ›
                </span>
            </div>

            {/* Footer — priority + estado */}
            <div style={{ ...s.cardFooter, visibility: isDragging ? "hidden" : "visible" }}>
                <Pill border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? variant : "muted"} size="xs" title="Type of trigger">{label}</Pill>
                <Pill border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? "brand" : "muted"} size="xs" title={`This trigger has a join priority of ${priority} (lower = more important)`}>
                    ★ {priority}
                </Pill>
                {autojoin && <Pill border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? "green" : "muted"} size="xs" emoji="🎯" iconOnly title="This trigger will join the link once matched" />}
                {notify && <Pill border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? "blue" : "muted"} size="xs" emoji="🔔" iconOnly title="This trigger will notify you once matched" />}
                {joinlock && <Pill border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? "yellow" : "muted"} size="xs" emoji="🔒" iconOnly title={`This trigger will lock joins for ${joinlockDuration} seconds once matched`} />}
                {hasAnyBypass && (() => {
                    const bypasses: string[] = [];
                    if (bypassMonitoredOnly) bypasses.push("Monitor-only bypass");
                    if (bypassIgnoredGuilds) bypasses.push("Server bypass");
                    if (bypassIgnoredChannels) bypasses.push("Channel bypass");
                    if (bypassMatchAmbiguity) bypasses.push("Match ambiguity bypass");
                    if (bypassLinkVerification) bypasses.push("Link verification bypass");
                    return (
                        <Pill
                            border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? "red" : "muted"}
                            size="xs"
                            emoji="✂️"
                            iconOnly
                            title={"This trigger has the following bypasses:\n" + bypasses.join(" · ")}
                        />
                    );
                })()}
                {(forwarding.onMatch.enabled || forwarding.onDetection.enabled) && <Pill border={enabled ? PILL_BORDER_STYLE : "none"} radius={PILL_RADIUS_STYLE} variant={enabled ? "blue" : "muted"} size="xs" emoji="➡️" iconOnly title={"This trigger will forward the messages to a webhook"} />}
            </div>
        </div>
    );
}

// Lightweight floating preview that follows the cursor while dragging — deliberately
// simpler than the full card (icon + name only), matching how Discord's own reorder
// previews look for channels/servers.
function DragGhost({ trigger }: { trigger: Trigger; }) {
    const variant = TYPE_PILL_VARIANT[trigger.type];
    const initial = trigger.name.charAt(0).toUpperCase();
    const { enabled } = trigger.state;

    return (
        <div style={s.dragGhost}>
            {trigger.iconUrl
                ? <img src={trigger.iconUrl} alt="" style={s.cardIcon} />
                : <div
                    className={`vc-sora-pill-base vc-sora-pill-${enabled ? variant : "muted"}`}
                    style={{ ...s.cardIconPlaceholder, borderRadius: 8, whiteSpace: "unset" }}
                >
                    {initial}
                </div>
            }
            <span style={s.cardName(enabled)}>{trigger.name}</span>
        </div>
    );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

const QUICK_FILTERS: { type: TriggerType | "all"; label: string; variant: PillVariant; }[] = [
    { type: "all", label: "All", variant: "brand" },
    { type: "RARE_BIOME", label: "Rare Biome", variant: "red" },
    { type: "EVENT_BIOME", label: "Event", variant: "green" },
    { type: "BIOME", label: "Biome", variant: "pink" },
    { type: "WEATHER", label: "Weather", variant: "blue" },
    { type: "MERCHANT", label: "Merchant", variant: "yellow" },
    { type: "CUSTOM", label: "Custom", variant: "muted" },
];


export function CollapsibleTip({ children, title = "Tips", emoji }: {
    children: React.ReactNode;
    title?: string;
    emoji?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div style={{ marginBottom: 6 }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--text-muted)",
                    fontSize: 12,
                    userSelect: "none",
                }}
            >
                <span style={{
                    display: "inline-block",
                    transition: "transform 150ms ease",
                    transform: open ? "rotate(90deg)" : "rotate(0deg)",
                    fontSize: 10,
                }}>▶</span>
                {emoji && <span style={{ fontSize: 13 }}>{emoji}</span>}
                {title}
            </button>

            {open && (
                <div style={{
                    marginTop: 6,
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "var(--background-mod-subtle)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                }}>
                    {children}
                </div>
            )}
        </div>
    );
}

export function TriggersTab() {
    const triggers = useTriggers();
    const importRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [shiftHeld, setShiftHeld] = useState(false);
    const saved = UIState.get("triggers");
    const [search, setSearch] = useState(saved.search);
    const [typeFilter, setTypeFilter] = useState<TriggerType | "all">(saved.typeFilter);
    const { useLegacyMouseBehaviorForTriggers: legacyMouseBehavior } = settings.use(["useLegacyMouseBehaviorForTriggers"]);

    const handleSearchChange = (v: string) => {
        setSearch(v);
        UIState.set("triggers", { search: v });
    };

    const handleTypeFilterChange = (f: TriggerType | "all") => {
        setTypeFilter(f);
        UIState.set("triggers", { typeFilter: f });
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") setShiftHeld(true);

            // // handle pasting
            // if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
            //     navigator.clipboard.readText().then(text => {
            //         if (!text.trim()) return;
            //         importTriggersFromJson(text, "merge").then(result => {
            //             if (result.ok) showToast(`Imported ${result.imported} trigger(s) from clipboard!`, Toasts.Type.SUCCESS);
            //         });
            //     }).catch(() => { });
            // }
        };
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

    const filtered = React.useMemo(() => {
        const q = parseQuery(search);
        return applyQuery(triggers, q, typeFilter);
    }, [triggers, search, typeFilter]);

    // Ordering (drag or legacy ▲▼) is purely visual, so it's disabled while any
    // filter narrows the list — pill filter or text search alike.
    const orderingDisabled = filtered.length !== triggers.length;

    const showImportModeAlert = (json: string) => {
        Alerts.show({
            title: "Import Triggers",
            body: (
                <div style={{ minWidth: "350px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <Paragraph>
                        How would you like to import these triggers?<br /><br />
                        <strong>Add as new</strong> - added alongside your existing ones.<br /><br />
                        <strong>Replace</strong> - current triggers deleted and replaced.
                    </Paragraph>
                    <div style={{ display: "flex", flexDirection: "row", gap: 8, width: "100%" }}>
                        <Button variant="positive" style={{ flex: 1 }} onClick={() => {
                            Alerts.close();
                            importTriggersFromJson(json, "merge").then(result => {
                                if (result.ok) showToast(`Imported ${result.imported} trigger(s)!`, Toasts.Type.SUCCESS);
                                else showToast(`Import failed: ${result.error}`, Toasts.Type.FAILURE);
                            });
                        }}>Add as new</Button>
                        <Button variant="dangerPrimary" style={{ flex: 1 }} onClick={() => {
                            Alerts.close();
                            importTriggersFromJson(json, "replace").then(result => {
                                if (result.ok) showToast(`Imported ${result.imported} trigger(s)!`, Toasts.Type.SUCCESS);
                                else showToast(`Import failed: ${result.error}`, Toasts.Type.FAILURE);
                            });
                        }}>Replace</Button>
                    </div>
                </div>
            ),
            confirmText: "Cancel",
        });
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        const reader = new FileReader();
        reader.onload = ev => showImportModeAlert(ev.target?.result as string);
        reader.readAsText(file);
    };

    const handleImportMenu = () => {
        Alerts.show({
            title: "Import Triggers",
            body: (
                <div style={{ minWidth: "350px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Paragraph>Choose an import source:</Paragraph>
                    <Button variant="secondary" style={{ width: "100%" }} onClick={() => {
                        Alerts.close();
                        showImportModeAlert(JSON.stringify(defaultTriggers)); // import do teu triggers.json
                    }}>Default Triggers</Button>
                    <Button variant="secondary" style={{ width: "100%" }} onClick={() => {
                        Alerts.close();
                        importRef.current?.click();
                    }}>From File</Button>
                </div>
            ),
            confirmText: "Cancel",
        });
    };

    const handleExport = () => {
        confirmWebhookThenRun(triggers, () => {
            try {
                downloadTriggersJson();
                showToast("Successfully exported triggers!", Toasts.Type.SUCCESS);
            } catch (error) {
                showToast(`Failed to export triggers: ${error}`, Toasts.Type.FAILURE);
            }
        });
    };

    const handlePublicExport = () => {
        let currentFields = new Set<RedactField>(["webhookUrl", "webhookForwarding", "notificationSound", "enabled", "customTriggers"]);

        Alerts.show({
            title: "Public Export",
            body: <PublicExportOptions onChange={fields => { currentFields = fields; }} />,
            confirmText: "Export",
            cancelText: "Cancel",
            onConfirm: () => {
                try {
                    downloadTriggersJsonRedacted({ redact: [...currentFields] });
                    showToast("Successfully exported triggers!", Toasts.Type.SUCCESS);
                } catch (error) {
                    showToast(`Failed to export triggers: ${error}`, Toasts.Type.FAILURE);
                }
            },
        });
    };

    const move = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= triggers.length) return;
        const newOrder = [...triggers];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);
        reorderTriggers(newOrder);
    };

    // `slot` is "insert right before the item currently at real array index `slot`"
    // (or, when slot === triggers.length, "insert at the very end") — measured
    // against the array as it stands BEFORE the dragged item is removed.
    const moveToSlot = (fromIndex: number, slot: number) => {
        move(fromIndex, slot > fromIndex ? slot - 1 : slot);
    };

    // ─── Drag-to-reorder (pointer-based) ───────────────────────────────────────
    // Native HTML5 drag-and-drop is unreliable for custom previews inside Electron
    // (drag image, overflow clipping on the insertion line, tiny native hitboxes),
    // so this is driven entirely by pointer events + manual hit-testing instead.
    const [drag, setDrag] = useState<{
        fromIndex: number;
        width: number;
        grabOffsetX: number;
        grabOffsetY: number;
        pointerClientX: number;
        pointerClientY: number;
        targetSlot: number | null;
        indicator: { top: number; left: number; width: number; } | null;
    } | null>(null);

    const startDrag = (fromIndex: number, e: React.PointerEvent, cardRect: DOMRect) => {
        e.preventDefault();
        setDrag({
            fromIndex,
            width: cardRect.width,
            grabOffsetX: e.clientX - cardRect.left,
            grabOffsetY: e.clientY - cardRect.top,
            pointerClientX: e.clientX,
            pointerClientY: e.clientY,
            targetSlot: null,
            indicator: null,
        });
    };

    useEffect(() => {
        if (!drag) return;

        const onMove = (e: PointerEvent) => {
            const containerRect = containerRef.current?.getBoundingClientRect();
            const wrapperRect = wrapperRef.current?.getBoundingClientRect();

            let targetSlot: number | null = null;
            let indicator: NonNullable<typeof drag>["indicator"] = null;

            const nearContainer = containerRect
                && e.clientX >= containerRect.left - 40 && e.clientX <= containerRect.right + 40
                && e.clientY >= containerRect.top - 40 && e.clientY <= containerRect.bottom + 40;

            if (nearContainer && wrapperRect) {
                const rows = Array.from(wrapperRef.current?.querySelectorAll<HTMLElement>("[data-trigger-index]") ?? [])
                    .map(el => ({ idx: Number(el.dataset.triggerIndex), rect: el.getBoundingClientRect() }))
                    .filter(r => !Number.isNaN(r.idx))
                    .sort((a, b) => a.idx - b.idx);

                if (rows.length > 0) {
                    // One canonical Y per possible insertion slot (N rows → N+1 slots).
                    // Internal slots sit at the midpoint of the gap between two rows,
                    // so there's exactly one Y for "between row 2 and row 3" — not two
                    // (row 2's bottom edge vs row 3's top edge) like hit-testing per-row gave.
                    const slotYs = rows.map((r, i) =>
                        i === 0 ? r.rect.top : (rows[i - 1].rect.bottom + r.rect.top) / 2
                    );
                    slotYs.push(rows[rows.length - 1].rect.bottom);

                    let bestSlot = 0;
                    let bestDist = Infinity;
                    slotYs.forEach((y, k) => {
                        const d = Math.abs(e.clientY - y);
                        if (d < bestDist) { bestDist = d; bestSlot = k; }
                    });

                    // Dropping right back next to itself wouldn't actually move anything.
                    const isNoOp = bestSlot === drag.fromIndex || bestSlot === drag.fromIndex + 1;
                    if (!isNoOp) {
                        targetSlot = bestSlot;
                        const row = rows[Math.min(bestSlot, rows.length - 1)];
                        indicator = {
                            top: slotYs[bestSlot] - wrapperRect.top,
                            left: row.rect.left - wrapperRect.left,
                            width: row.rect.width,
                        };
                    }
                }
            }

            setDrag(prev => prev && {
                ...prev,
                pointerClientX: e.clientX,
                pointerClientY: e.clientY,
                targetSlot,
                indicator,
            });
        };

        const finishDrag = () => {
            setDrag(prev => {
                if (prev && prev.targetSlot !== null) {
                    moveToSlot(prev.fromIndex, prev.targetSlot);
                }
                return null;
            });
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", finishDrag);
        window.addEventListener("pointercancel", finishDrag);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", finishDrag);
            window.removeEventListener("pointercancel", finishDrag);
        };
    }, [drag?.fromIndex]);

    return (
        <div ref={wrapperRef} style={{ ...s.wrapper, position: "relative" }}>

            {/* Filters */}
            <div style={s.filters}>
                <TextInput
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Search or query: enabled:true  join:false  priority:>5  notify:true"
                />
                <div style={s.quickFilters}>
                    {QUICK_FILTERS.map(f => (
                        <QuickFilterBtn
                            key={f.type}
                            label={f.label}
                            variant={f.variant}
                            active={typeFilter === f.type}
                            onClick={() => handleTypeFilterChange(f.type)}
                        />
                    ))}
                </div>
                <JoinLockBanner />
            </div>

            {/* List */}
            <div ref={containerRef} style={s.container}>
                {filtered.length === 0
                    ? (
                        <div style={s.empty}>
                            <Paragraph size="sm">
                                {triggers.length === 0
                                    ? "No triggers yet. Create a new trigger or import some from a file!"
                                    : "No triggers match your search."}
                            </Paragraph>
                        </div>
                    )
                    : (
                        <div style={s.list}>
                            {filtered.map((t, i) => {
                                // i no array filtrado — pra order buttons precisamos do índice real
                                const realIdx = triggers.indexOf(t);
                                return (
                                    <TriggerCard
                                        key={t.id}
                                        trigger={t}
                                        index={realIdx}
                                        isFirst={realIdx === 0}
                                        isLast={realIdx === triggers.length - 1}
                                        shiftHeld={shiftHeld}
                                        orderingDisabled={orderingDisabled}
                                        legacyMouseBehavior={legacyMouseBehavior}
                                        isDragging={drag?.fromIndex === realIdx}
                                        onMoveUp={() => move(realIdx, realIdx - 1)}
                                        onMoveDown={() => move(realIdx, realIdx + 1)}
                                        onDragHandleDown={(e, cardRect) => startDrag(realIdx, e, cardRect)}
                                    />
                                );
                            })}
                        </div>
                    )
                }

                {/* Insertion indicator — where the dragged trigger will land */}
                {drag?.indicator && (
                    <div style={{
                        position: "absolute",
                        top: drag.indicator.top - 1.5,
                        left: drag.indicator.left,
                        width: drag.indicator.width,
                        height: 3,
                        borderRadius: 2,
                        background: "var(--green-360, #23a55a)",
                        pointerEvents: "none",
                        zIndex: 30,
                    }} />
                )}
            </div>

            {/* Floating preview that follows the cursor while dragging — portaled to
                <body> so it isn't clipped by the modal's own overflow:hidden if it's
                dragged past the modal's edge. */}
            {drag && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: drag.pointerClientY - drag.grabOffsetY,
                    left: drag.pointerClientX - drag.grabOffsetX,
                    width: drag.width,
                    borderRadius: 8,
                    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.45)",
                    opacity: 0.96,
                    pointerEvents: "none",
                    zIndex: 9999,
                }}>
                    <DragGhost trigger={triggers[drag.fromIndex]} />
                </div>,
                document.body
            )}

            {/* <CollapsibleTip title="Tips">Left click on a trigger to edit it. Right click to toggle between enabled/disabled. Hold Shift to show delete button.</CollapsibleTip> */}
            {/* Toolbar */}
            <div style={s.toolbar}>
                <Paragraph>
                    {filtered.length === triggers.length
                        ? `${triggers.length} trigger${triggers.length !== 1 ? "s" : ""}`
                        : `${filtered.length} of ${triggers.length}`}
                </Paragraph>
                <div style={s.toolbarRight}>
                    {isDeveloper() && (
                        <Button size="small" variant="link" onClick={handlePublicExport}>
                            Safe Export
                        </Button>
                    )}
                    <Button size="small" variant="link" onClick={handleExport}>
                        Export
                    </Button>
                    <Button size="small" variant="link" onClick={handleImportMenu}>
                        Import
                    </Button>
                    <Button size="small" variant="positive" onClick={openAddTriggerModal}>
                        + New trigger
                    </Button>
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
