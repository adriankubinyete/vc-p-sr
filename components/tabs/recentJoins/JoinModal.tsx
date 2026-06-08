/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { copyToClipboard } from "@utils/clipboard";
import { closeAllModals, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModal } from "@utils/modal";
import { NavigationRouter, React, showToast, Toasts } from "@webpack/common";

import { joinUri } from "../../../services/RobloxService";
import { settings } from "../../../settings";
import { SnipeEntry, SnipeLogEntry, SnipeStore, useSnipeEntry } from "../../../stores/SnipeStore";
import { SnipeTag } from "../../../types";
import { formatElapsedTime } from "../../../utils";
import Spoiler from "../../ui/Spoiler";
import { FallbackImage, formatTimeAgo, MessageTextarea,TagBadge } from "./components";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function DetailRow({ label, value }: { label: string; value: React.ReactNode; }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
            <span style={{ color: "var(--control-secondary-text-default)", textAlign: "right" }}>{value}</span>
        </div>
    );
}

// ─── Biome verdict ────────────────────────────────────────────────────────────

// When the user manually marks a biome verdict, we strip only these tags before
// adding the new one — so real/bait never coexist and unrelated tags are untouched.
const BIOME_VERDICT_TAGS: SnipeTag[] = [
    "biome-verified-real",
    "biome-verified-bait",
    "biome-verified-timeout",
    "biome-not-verified",
];

// ─── Modal ────────────────────────────────────────────────────────────────────

function SnipeLog({ entries }: { entries: SnipeLogEntry[]; }) {
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [entries.length]);

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");
        const s = d.getSeconds().toString().padStart(2, "0");
        return `${h}:${m}:${s}`;
    };

    const levelColor = (level: SnipeLogEntry["level"]) => {
        switch (level) {
            case "error": return "var(--text-feedback-critical)";
            case "warn": return "var(--status-warning)";
            case "debug": return "var(--text-muted)";
            default: return "var(--text-brand)";
        }
    };

    const copyLog = () => {
        const text = entries
            .map(l => `[${formatTime(l.timestamp)}] ${l.level.toUpperCase()} ${l.message}`)
            .join("\n");
        copyToClipboard(text);
        showToast("Log copied!", Toasts.Type.SUCCESS);
    };

    return (
        <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                <Button size="small" variant="none" onClick={copyLog}>click here to copy</Button>
            </div>
            <div ref={ref} style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                fontFamily: "var(--font-code)",
                fontSize: 12,
                background: "var(--background-tertiary)",
                border: "1px solid var(--background-mod-subtle)",
                borderRadius: 6,
                padding: "8px 10px",
                maxHeight: 200,
                overflowY: "auto",
                scrollbarWidth: "thin",
            }}>
                {entries.map((line, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, lineHeight: 1.6 }}>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                            {formatTime(line.timestamp)}
                        </span>
                        <span style={{ color: levelColor(line.level), flexShrink: 0, minWidth: 36 }}>
                            {line.level.toUpperCase()}
                        </span>
                        <span style={{ color: "var(--text-default)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                            {line.message}
                        </span>
                    </div>
                ))}
            </div>
        </>
    );
}

function JoinModal({ entry: initialEntry, modalProps }: {
    entry: SnipeEntry;
    modalProps: ModalProps;
}) {
    const entry = useSnipeEntry(initialEntry.id) ?? initialEntry;
    const { anonymizeEverything } = settings.use(["anonymizeEverything"]);

    const jumpToMessage = () => {
        if (!entry.messageJumpUrl) return;
        try {
            NavigationRouter.transitionTo(new URL(entry.messageJumpUrl).pathname);
            closeAllModals();
        } catch {
            showToast("Failed to navigate to message.", Toasts.Type.FAILURE);
        }
    };

    const isBiomeEntry = entry.tags.some(t => t.startsWith("biome-"));
    const [overridesOpen, setOverridesOpen] = React.useState(false);

    const markBiome = (verdict: "real" | "bait") => {
        const newTag: SnipeTag = verdict === "real" ? "biome-verified-real" : "biome-verified-bait";
        const newTags = [...entry.tags.filter(t => !BIOME_VERDICT_TAGS.includes(t)), newTag];
        SnipeStore.update(entry.id, { tags: newTags }, { replaceTags: true });
    };

    const joinServer = () => {
        if (!entry.joinUri) return showToast("No join link detected.", Toasts.Type.FAILURE);
        try {
            joinUri(entry.joinUri);
            closeAllModals();
        } catch {
            showToast("Failed to join server.", Toasts.Type.FAILURE);
        }
    };

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader separator>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    <FallbackImage src={entry.iconUrl} style={{ width: 28, height: 28, borderRadius: 6 }} />
                    <Heading tag="h5" style={{ flex: 1 }}>{entry.triggerName}</Heading>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>
            <Divider style={{ margin: "8px 0" }} />
            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 0" }}>

                    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <Heading tag="h5">Status</Heading>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {entry.tags.map(t => <TagBadge key={t} tag={t} />)}
                        </div>
                        {isBiomeEntry && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <button
                                    onClick={() => setOverridesOpen(v => !v)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        background: "none", border: "none",
                                        padding: "4px 0", cursor: "pointer", textAlign: "left",
                                    }}
                                >
                                    <span style={{
                                        color: "var(--text-muted)", fontSize: 10,
                                        display: "inline-block", lineHeight: 1,
                                        transition: "transform 0.15s",
                                        transform: overridesOpen ? "rotate(90deg)" : "rotate(0deg)",
                                    }}>▶</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>
                                        Overrides
                                    </span>
                                </button>
                                {overridesOpen && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        <div style={{
                                            display: "flex", flexDirection: "column", gap: 8,
                                            padding: "10px 12px", borderRadius: 6,
                                            background: "var(--background-mod-subtle)",
                                        }}>
                                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Biome tag</span>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <Button size="small" variant="positive" onClick={() => markBiome("real")} style={{ flex: 1 }}>Biome was real</Button>
                                                <Button size="small" variant="dangerPrimary" onClick={() => markBiome("bait")} style={{ flex: 1 }}>Biome was fake</Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <Divider />

                    <section>
                        <Heading tag="h5" style={{ marginBottom: 8 }}>Details</Heading>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <DetailRow label="Snipe ID" value={`${entry.id}`} />
                            <DetailRow label="Trigger" value={`${entry.triggerName}`} />
                            <DetailRow label="Priority" value={`${entry.triggerPriority}`} />
                            <DetailRow label="Type" value={entry.triggerType} />
                            {entry.biomeDurationMs && (
                                <DetailRow label="Biome duration" value={formatElapsedTime(entry.biomeDurationMs)} />
                            )}
                            <DetailRow label="Time" value={
                                anonymizeEverything
                                    ? <Spoiler><span>{formatTimeAgo(entry.timestamp)} ⬝ {new Date(entry.timestamp).toLocaleString()}</span></Spoiler>
                                    : `${formatTimeAgo(entry.timestamp)} ⬝ ${new Date(entry.timestamp).toLocaleString()}`
                            } />

                            {entry.channelName && (
                                <DetailRow label="Channel" value={
                                    anonymizeEverything
                                        ? <Spoiler><span>{`#${entry.channelName}${entry.guildName ? ` ⬝ ${entry.guildName}` : ""}`}</span></Spoiler>
                                        : `#${entry.channelName}${entry.guildName ? ` ⬝ ${entry.guildName}` : ""}`
                                } />
                            )}

                            {entry.authorName && (
                                <DetailRow label="Posted by" value={
                                    anonymizeEverything
                                        ? <Spoiler style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                            <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                                            <span>{entry.authorName}</span>
                                        </Spoiler>
                                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                            <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                                            {entry.authorName}
                                        </span>
                                } />
                            )}
                        </div>
                    </section>

                    {entry?.processedMessageText && <>
                        <Divider />
                        <section>
                            <Heading tag="h5" style={{ marginBottom: 8 }}>User message (cleaned)</Heading>
                            {anonymizeEverything
                                ? <Spoiler
                                    style={{ display: "block", width: "100%" }}
                                    placeholder={<MessageTextarea value="█████ ████ ██ ███████ ████" />}
                                >
                                    <MessageTextarea value={entry.processedMessageText} />
                                </Spoiler>
                                : <MessageTextarea value={entry.processedMessageText} />
                            }
                        </section>
                    </>}

                    {entry.metrics && <>
                        <Divider />
                        <section>
                            <Heading tag="h5" style={{ marginBottom: 8 }}>Performance</Heading>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <DetailRow label="Total processing time" value={`${entry.metrics.timeToJoinMs.toFixed(1)} ms`} />
                                {/* <DetailRow label="Launch Roblox" value={`${entry.metrics.joinDurationMs.toFixed(1)} ms`} /> */}
                                <DetailRow label="Plugin overhead" value={`${entry.metrics.overheadMs.toFixed(1)} ms`} />
                                <DetailRow label="Roblox launch" value={`${entry.metrics.openUriDurationMs.toFixed(1)} ms`} />
                                {entry.metrics.killDurationMs !== null && (
                                    <>
                                        <DetailRow label="Process kill" value={`${entry.metrics.killDurationMs.toFixed(1)} ms`} />
                                    </>
                                )}
                            </div>
                        </section>
                    </>}

                    {entry.log && entry.log.length > 0 && <>
                        <Divider />
                        <section>
                            <Heading tag="h5" style={{ marginBottom: 8 }}>Log</Heading>
                            {anonymizeEverything
                                ? <Spoiler
                                    style={{ display: "block", width: "100%" }}
                                    placeholder={<MessageTextarea value="███ ███████ ██ ██ █ ███████ █ █████" />}
                                >
                                    <SnipeLog entries={entry.log} />
                                </Spoiler>
                                : <SnipeLog entries={entry.log} />
                            }
                        </section>
                    </>}
                </div>
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
                    {entry.joinUri && (
                        <Button variant="positive" size="small" onClick={joinServer}>Join</Button>
                    )}
                    {entry.link && (
                        <Button variant="primary" size="small" onClick={() => {
                            copyToClipboard(entry.link!);
                            showToast("Copied!", Toasts.Type.SUCCESS);
                        }}>
                            Copy link
                        </Button>
                    )}
                    {entry.messageJumpUrl && (
                        <Button variant="link" size="small" onClick={jumpToMessage}>Go to message</Button>
                    )}
                    <Button
                        size="small"
                        variant="dangerPrimary"
                        onClick={() => { SnipeStore.delete(entry.id); modalProps.onClose(); }}
                        style={{ marginLeft: "auto" }}
                    >
                        Delete
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}
// ─── Entrypoint ───────────────────────────────────────────────────────────────

export function openJoinModal(entry: SnipeEntry, onCloseAll?: () => void): void {
    openModal(p => <JoinModal entry={entry} modalProps={p} />);
}
