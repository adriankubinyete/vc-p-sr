/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { copyToClipboard } from "@utils/clipboard";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModal } from "@utils/modal";
import { NavigationRouter, React, showToast, Toasts, useState } from "@webpack/common";

import { JoinEntry, JoinStore, JoinTag, TAG_CONFIGS } from "../../../../stores/JoinStore";

export const AVATAR_FALLBACK = "https://discord.com/assets/881ed827548f38c6.svg";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatTimeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Tag helpers ──────────────────────────────────────────────────────────────

export const SUCCESS_TAGS = new Set<JoinTag>(["link-verified-safe", "biome-verified-real"]);
export const DANGER_TAGS = new Set<JoinTag>(["link-verified-unsafe", "biome-verified-bait", "failed"]);
export const WARN_TAGS = new Set<JoinTag>(["biome-verified-timeout"]);

export function tagVariant(tag: JoinTag): "success" | "danger" | "warning" | "muted" {
    if (SUCCESS_TAGS.has(tag)) return "success";
    if (DANGER_TAGS.has(tag)) return "danger";
    if (WARN_TAGS.has(tag)) return "warning";
    return "muted";
}

const BADGE_COLORS = {
    success: { bg: "color-mix(in srgb, var(--green-360) 15%, transparent)", color: "var(--green-360)" },
    danger: { bg: "color-mix(in srgb, var(--red-400) 15%, transparent)", color: "var(--red-400)" },
    warning: { bg: "color-mix(in srgb, var(--yellow-300) 15%, transparent)", color: "var(--yellow-300)" },
    muted: { bg: "var(--background-modifier-accent)", color: "var(--text-muted)" },
};

// ─── Shared primitives ────────────────────────────────────────────────────────

export function TagBadge({ tag, size = "normal" }: { tag: JoinTag; size?: "small" | "normal"; }) {
    const config = TAG_CONFIGS[tag];
    const colors = BADGE_COLORS[tagVariant(tag)];
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: size === "small" ? "1px 6px" : "2px 8px",
            borderRadius: 999,
            fontSize: size === "small" ? 11 : 12,
            fontWeight: 600,
            background: colors.bg,
            color: colors.color,
            whiteSpace: "nowrap",
        }}>
            {config.emoji} {config.label}
        </span>
    );
}

export function FallbackImage({ src, style }: { src?: string; style?: React.CSSProperties; }) {
    const [imgSrc, setImgSrc] = useState(src || AVATAR_FALLBACK);
    React.useEffect(() => setImgSrc(src || AVATAR_FALLBACK), [src]);
    return <img src={imgSrc} alt="" onError={() => setImgSrc(AVATAR_FALLBACK)} style={style} />;
}

export function Divider() {
    return <hr style={{ border: "none", borderTop: "1px solid var(--background-mod-normal)", margin: 0 }} />;
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode; }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
            <span style={{ color: "var(--text-normal)", textAlign: "right" }}>{value}</span>
        </div>
    );
}

export function Btn({ variant, onClick, children, style }: {
    variant: "primary" | "secondary" | "danger";
    onClick: () => void;
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    const COLORS = {
        primary: { background: "var(--brand-500)", color: "#fff" },
        secondary: { background: "var(--background-secondary)", color: "var(--text-normal)" },
        danger: { background: "var(--red-400)", color: "#fff" },
    };
    return (
        <button onClick={onClick} style={{
            padding: "6px 16px", borderRadius: 4, border: "none",
            fontWeight: 600, fontSize: 13, cursor: "pointer",
            ...COLORS[variant], ...style,
        }}>
            {children}
        </button>
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function JoinModal({ entry, modalProps, onCloseAll }: {
    entry: JoinEntry;
    modalProps: ModalProps;
    onCloseAll?: () => void;
}) {
    const jumpToMessage = () => {
        if (!entry.messageJumpUrl) return;
        try {
            NavigationRouter.transitionTo(new URL(entry.messageJumpUrl).pathname);
            modalProps.onClose();
            onCloseAll?.();
        } catch {
            showToast("Failed to navigate to message.", Toasts.Type.FAILURE);
        }
    };

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader separator >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    <FallbackImage src={entry.iconUrl} style={{ width: 28, height: 28, borderRadius: 6 }} />
                    <Heading tag="h5" style={{ flex: 1 }}>{entry.triggerName}</Heading>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>
            <Divider />
            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 0" }}>

                    <section>
                        <Heading tag="h5" style={{ marginBottom: 8 }}>Status</Heading>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {entry.tags.map(t => <TagBadge key={t} tag={t} />)}
                        </div>
                    </section>

                    <Divider />

                    <section>
                        <Heading tag="h5" style={{ marginBottom: 8 }}>Details</Heading>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <DetailRow label="Trigger" value={`${entry.triggerName} (p${entry.triggerPriority})`} />
                            <DetailRow label="Type" value={entry.triggerType} />
                            <DetailRow label="Time" value={`${formatTimeAgo(entry.timestamp)} · ${new Date(entry.timestamp).toLocaleString()}`} />
                            {entry.channelName && (
                                <DetailRow label="Channel" value={`#${entry.channelName}${entry.guildName ? ` · ${entry.guildName}` : ""}`} />
                            )}
                            {entry.authorName && (
                                <DetailRow label="Posted by" value={
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                                        {entry.authorName}
                                    </span>
                                } />
                            )}
                        </div>
                    </section>

                    {entry.metrics && <>
                        <Divider />
                        <section>
                            <Heading tag="h5" style={{ marginBottom: 8 }}>Performance</Heading>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <DetailRow label="Total (msg to join)" value={`${entry.metrics.timeToJoinMs.toFixed(1)} ms`} />
                                <DetailRow label="openUri duration" value={`${entry.metrics.joinDurationMs.toFixed(1)} ms`} />
                                <DetailRow label="Overhead" value={`${entry.metrics.overheadMs.toFixed(1)} ms`} />
                            </div>
                        </section>
                    </>}

                </div>
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                    {entry.messageJumpUrl && (
                        <Btn variant="primary" onClick={jumpToMessage}>Jump to message</Btn>
                    )}
                    {entry.originalContent && (
                        <Btn variant="primary" onClick={() => {
                            copyToClipboard(entry.originalContent!);
                            showToast("Copied!", Toasts.Type.SUCCESS);
                        }}>
                            Copy link
                        </Btn>
                    )}
                    <Btn
                        variant="danger"
                        onClick={() => { JoinStore.delete(entry.id); modalProps.onClose(); }}
                        style={{ marginLeft: "auto" }}
                    >
                        Delete
                    </Btn>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

export function openJoinModal(entry: JoinEntry, onCloseAll?: () => void): void {
    openModal(p => <JoinModal entry={entry} modalProps={p} onCloseAll={onCloseAll} />);
}
