/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { NavigationRouter, React, showToast, TextInput, Toasts, useState } from "@webpack/common";

import { JoinEntry, JoinStore, JoinTag, useJoinHistory } from "../../../../stores/JoinStore";
import { QuickFilterBtn } from "../../../buttons/QuickFilterBtn";
import { PillVariant } from "../../../Pill";
import { DANGER_TAGS, FallbackImage, formatTimeAgo, TagBadge } from "./components";
import {
    openJoinModal,
} from "./JoinModal";

// ─── Card styling ─────────────────────────────────────────────────────────────

function cardBorderColor(entry: JoinEntry): string {
    if (entry.tags.some(t => DANGER_TAGS.has(t))) return "color-mix(in srgb, var(--red-400) 35%, transparent)";
    if (entry.tags.includes("biome-verified-real")) return "color-mix(in srgb, var(--green-360) 35%, transparent)";
    return "var(--background-mod-normal)";
}

function cardBg(entry: JoinEntry): string {
    if (entry.tags.some(t => DANGER_TAGS.has(t))) return "color-mix(in srgb, var(--red-400) 5%, var(--background-secondary))";
    if (entry.tags.includes("biome-verified-real")) return "color-mix(in srgb, var(--green-360) 5%, var(--background-secondary))";
    return "var(--background-secondary)";
}

// ─── JoinCard ─────────────────────────────────────────────────────────────────

function JoinCard({ entry, onClick, onContextMenu }: {
    entry: JoinEntry;
    onClick: () => void;
    onContextMenu: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    const visibleTags = entry.tags.slice(0, 3);
    const extra = entry.tags.length - visibleTags.length;

    return (
        <div
            onClick={onClick}
            onContextMenu={e => { e.preventDefault(); onContextMenu(); }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title="Left click for details · Right click to jump to message"
            style={{
                borderRadius: 8,
                border: `1px solid ${cardBorderColor(entry)}`,
                background: cardBg(entry),
                cursor: "pointer",
                overflow: "hidden",
                transition: "filter 0.1s",
                filter: hovered ? "brightness(1.05)" : "none",
                userSelect: "none",
            }}
        >
            {/* Main row */}
            <div style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <FallbackImage
                    src={entry.iconUrl}
                    style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontWeight: 600, fontSize: 14, color: "var(--text-normal)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 2,
                    }}>
                        {entry.triggerName}
                    </div>
                    <div style={{
                        fontSize: 12, color: "var(--text-muted)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 6,
                    }}>
                        {[entry.channelName && `#${entry.channelName}`, entry.guildName].filter(Boolean).join(" · ")}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                        {entry.authorName && <>
                            <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                            <span>{entry.authorName}</span>
                            <span>·</span>
                        </>}
                        <span>{formatTimeAgo(entry.timestamp)}</span>
                    </div>
                </div>

                <span style={{ color: "var(--text-muted)", fontSize: 18, flexShrink: 0, alignSelf: "center" }}>›</span>
            </div>

            {/* Tags footer */}
            <div style={{
                borderTop: "1px solid var(--background-mod-normal)",
                padding: "6px 14px",
                display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
            }}>
                {visibleTags.map(t => <TagBadge key={t} tag={t} size="small" />)}
                {extra > 0 && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>+{extra}</span>
                )}
                {entry.metrics && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        ⚡ {entry.metrics.timeToJoinMs.toFixed(0)}ms
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── RecentJoinsTab ───────────────────────────────────────────────────────────

const FILTER_OPTIONS: { tagName: JoinTag | "all"; label: string; variant: PillVariant; }[] = [
    { tagName: "all", label: "All", variant: "brand" },
    { tagName: "biome-verified-real", label: "Biome Real", variant: "green" },
    { tagName: "biome-verified-bait", label: "Biome Bait", variant: "red" },
    { tagName: "biome-verified-timeout", label: "Biome Timed Out", variant: "yellow" },
    { tagName: "link-verified-unsafe", label: "Link Unsafe", variant: "red" },
    { tagName: "failed", label: "Failed", variant: "red" },
];

export function RecentJoinsTab() {
    const entries = useJoinHistory();
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");

    const filtered = React.useMemo(() => {
        let result = entries;
        if (filter !== "all") {
            result = result.filter(e => e.tags.includes(filter as JoinTag));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(e =>
                e.triggerName.toLowerCase().includes(q) ||
                e.authorName?.toLowerCase().includes(q) ||
                e.channelName?.toLowerCase().includes(q) ||
                e.guildName?.toLowerCase().includes(q)
            );
        }
        return result;
    }, [entries, filter, search]);

    const jumpToMessage = (entry: JoinEntry) => {
        if (!entry.messageJumpUrl) return;
        try { NavigationRouter.transitionTo(new URL(entry.messageJumpUrl).pathname); }
        catch { showToast("Failed to navigate.", Toasts.Type.FAILURE); }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>

            {/* Filters */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: "100%", flex: 1 }}>
                    <TextInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search by trigger, author, channel..."
                    />
                </div>
                <div style={{ width: "100%", display: "flex", gap: 4 }}>
                    {FILTER_OPTIONS.map(f => (
                        <QuickFilterBtn
                            key={f.tagName}
                            label={f.label}
                            variant={f.variant}
                            active={filter === f.tagName}
                            onClick={() => setFilter(f.tagName)}
                        />
                    ))}
                </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", scrollbarColor: "var(--text-muted) transparent", scrollbarWidth: "thin", scrollMarginLeft: 8 }}>
                {filtered.length === 0
                    ? (
                        <div style={{ textAlign: "center", marginTop: 40 }}>
                            <Paragraph size="sm">
                                {entries.length === 0
                                    ? "No joins yet. Links you snipe will appear here."
                                    : "No results match your filters."}
                            </Paragraph>
                        </div>
                    )
                    : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {filtered.map(e => (
                                <JoinCard
                                    key={e.id}
                                    entry={e}
                                    onClick={() => openJoinModal(e)}
                                    onContextMenu={() => jumpToMessage(e)}
                                />
                            ))}
                        </div>
                    )
                }
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, marginBottom: 12 }}>
                <Paragraph>
                    {filtered.length === entries.length
                        ? `${entries.length} join${entries.length !== 1 ? "s" : ""}`
                        : `${filtered.length} of ${entries.length}`}
                </Paragraph>
                <div style={{ display: "flex", gap: 4 }}>
                    <Button variant="primary" size="small" onClick={() => JoinStore.addFakes(1)} style={{ padding: "3px 10px", fontSize: 12 }}>
                        Add fake join
                    </Button>
                    {entries.length > 0 && (
                        <Button variant="dangerPrimary" size="small" onClick={() => JoinStore.clear()} style={{ padding: "3px 10px", fontSize: 12 }}>
                            Clear all
                        </Button>
                    )}
                </div>

            </div>

        </div>
    );
}
