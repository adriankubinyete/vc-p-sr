/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Logger } from "@utils/Logger";
import { React, showToast, TextInput, Toasts, useEffect, useRef, useState } from "@webpack/common";

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
import { QuickFilterBtn } from "../../../buttons/QuickFilterBtn";
import { Pill, PillBorder, PillRadius, PillVariant } from "../../../Pill";
import { JoinLockBanner } from "../../../ui/JoinLockBanner";
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
    isFirst,
    isLast,
    shiftHeld,
    filterApplied,
    onMoveUp,
    onMoveDown,
}: {
    trigger: Trigger;
    isFirst: boolean;
    isLast: boolean;
    shiftHeld: boolean;
    filterApplied: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    const variant = TYPE_PILL_VARIANT[trigger.type];
    const label = TYPE_LABELS[trigger.type];
    const initial = trigger.name.charAt(0).toUpperCase();
    const [hovered, setHovered] = useState(false);
    const { enabled, autojoin, notify, joinlock, joinlockDuration, priority } = trigger.state;
    const { bypassMonitoredOnly, bypassIgnoredChannels, bypassIgnoredGuilds, bypassMatchAmbiguity, bypassLinkVerification } = trigger.conditions;
    const hasAnyBypass = bypassMonitoredOnly || bypassIgnoredChannels || bypassIgnoredGuilds || bypassMatchAmbiguity || bypassLinkVerification;

    const PILL_BORDER_STYLE: PillBorder = "subtle";
    const PILL_RADIUS_STYLE: PillRadius = "xs";

    const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <div
            style={{ ...s.card(enabled), filter: hovered ? "brightness(1.1)" : "none" }}
            onClick={() => openEditTriggerModal(trigger)}
            onContextMenu={e => { e.preventDefault(); toggleTrigger(trigger.id); }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={`${trigger.name} · Left click to edit · Right click to toggle trigger`}
        >
            {/* Main row */}
            <div style={s.cardMain}>
                {/* Ordem */}
                {!filterApplied && (
                    <div style={s.orderButtons} onClick={stopPropagation} onContextMenu={stopPropagation}>
                        <button style={s.orderBtn(isFirst)} disabled={isFirst} onClick={onMoveUp} title="Move this card up">▲</button>
                        <button style={s.orderBtn(isLast)} disabled={isLast} onClick={onMoveDown} title="Move this card down">▼</button>
                    </div>
                )}

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
                {shiftHeld && (
                    <div onClick={stopPropagation} onContextMenu={stopPropagation}>
                        <button style={s.deleteBtn()} onClick={() => deleteTrigger(trigger.id)} title="Delete trigger (no confirmation!)">
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {/* Footer — priority + estado */}
            <div style={s.cardFooter}>
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
                    if (bypassIgnoredGuilds) bypasses.push("Guild bypass");
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
            </div>
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
    const [shiftHeld, setShiftHeld] = useState(false);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<TriggerType | "all">("all");

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

    const filtered = React.useMemo(() => {
        const q = parseQuery(search);
        return applyQuery(triggers, q, typeFilter);
    }, [triggers, search, typeFilter]);

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

    const handleExport = () => {
        try {
            downloadTriggersJson();
            showToast("Successfully exported triggers!", Toasts.Type.SUCCESS);
        } catch (error) {
            showToast(`Failed to export triggers: ${error}`, Toasts.Type.FAILURE);
        }
    };

    const move = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= triggers.length) return;
        const newOrder = [...triggers];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);
        reorderTriggers(newOrder);
    };

    return (
        <div style={s.wrapper}>

            {/* Filters */}
            <div style={s.filters}>
                <TextInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search or query: enabled:true  join:false  priority:>5  notify:true"
                />
                <div style={s.quickFilters}>
                    {QUICK_FILTERS.map(f => (
                        <QuickFilterBtn
                            key={f.type}
                            label={f.label}
                            variant={f.variant}
                            active={typeFilter === f.type}
                            onClick={() => setTypeFilter(f.type)}
                        />
                    ))}
                </div>
                <JoinLockBanner />
            </div>

            {/* List */}
            <div style={s.container}>
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
                                        isFirst={realIdx === 0}
                                        isLast={realIdx === triggers.length - 1}
                                        shiftHeld={shiftHeld}
                                        filterApplied={typeFilter !== "all"}
                                        onMoveUp={() => move(realIdx, realIdx - 1)}
                                        onMoveDown={() => move(realIdx, realIdx + 1)}
                                    />
                                );
                            })}
                        </div>
                    )
                }
            </div>

            <CollapsibleTip title="Tips">Left click on a trigger to edit it. Right click to toggle between enabled/disabled. Hold Shift to show delete button.</CollapsibleTip>
            {/* Toolbar */}
            <div style={s.toolbar}>
                <Paragraph>
                    {filtered.length === triggers.length
                        ? `${triggers.length} trigger${triggers.length !== 1 ? "s" : ""}`
                        : `${filtered.length} of ${triggers.length}`}
                </Paragraph>
                <div style={s.toolbarRight}>
                    <Button size="small" variant="none" onClick={handleExport}>Export</Button>
                    <Button size="small" variant="none" onClick={() => importRef.current?.click()}>Import</Button>
                    <Button size="small" variant="positive" onClick={openAddTriggerModal}>+ New trigger</Button>
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
