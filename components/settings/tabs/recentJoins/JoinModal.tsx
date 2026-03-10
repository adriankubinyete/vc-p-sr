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

import { joinUri } from "../../../../services/RobloxService";
import { SnipeEntry, SnipeStore } from "../../../../stores/SnipeStore";
import { FallbackImage, formatTimeAgo, TagBadge } from "./components";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function DetailRow({ label, value }: { label: string; value: React.ReactNode; }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
            <span style={{ color: "var(--control-secondary-text-default)", textAlign: "right" }}>{value}</span>
        </div>
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function JoinModal({ entry, modalProps }: {
    entry: SnipeEntry;
    modalProps: ModalProps;
}) {
    const jumpToMessage = () => {
        if (!entry.messageJumpUrl) return;
        try {
            NavigationRouter.transitionTo(new URL(entry.messageJumpUrl).pathname);
            closeAllModals();
        } catch {
            showToast("Failed to navigate to message.", Toasts.Type.FAILURE);
        }
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
                            <DetailRow label="Snipe ID" value={`${entry.id}`} />
                            <DetailRow label="Trigger" value={`${entry.triggerName}`} />
                            <DetailRow label="Priority" value={`${entry.triggerPriority}`} />
                            <DetailRow label="Type" value={entry.triggerType} />
                            <DetailRow label="Time" value={`${formatTimeAgo(entry.timestamp)} ⬝ ${new Date(entry.timestamp).toLocaleString()}`} />
                            {entry.channelName && (
                                <DetailRow label="Channel" value={`#${entry.channelName}${entry.guildName ? ` ⬝ ${entry.guildName}` : ""}`} />
                            )}
                            {entry.authorName && (
                                <DetailRow label="Posted by" value={
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                                        {entry.authorName}
                                    </span>
                                } />
                            )}
                            {entry?.processedMessageText && (
                                <textarea
                                    readOnly
                                    value={entry.processedMessageText ?? ""}
                                    style={{
                                        width: "100%",
                                        resize: "vertical",
                                        padding: "8px 10px",
                                        borderRadius: 6,
                                        border: "1px solid var(--background-modifier-accent)",
                                        background: "var(--background-secondary)",
                                        color: "var(--text-normal)",
                                        fontSize: 13,
                                        fontFamily: "var(--font-code)",
                                        lineHeight: 1.5,
                                        minHeight: 60,
                                        boxSizing: "border-box",
                                        outline: "none",
                                        scrollbarWidth: "thin",
                                    }}
                                />
                            )}
                        </div>
                    </section>

                    {entry.metrics && <>
                        <Divider />
                        <section>
                            <Heading tag="h5" style={{ marginBottom: 8 }}>Performance</Heading>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <DetailRow label="Total (since message received)" value={`${entry.metrics.timeToJoinMs.toFixed(1)} ms`} />
                                <DetailRow label="Launch Roblox" value={`${entry.metrics.joinDurationMs.toFixed(1)} ms`} />
                                <DetailRow label="Overhead (plugin processing time)" value={`${entry.metrics.overheadMs.toFixed(1)} ms`} />
                            </div>
                        </section>
                    </>}

                </div>
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
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
                        <Button variant="primary" size="small" onClick={jumpToMessage}>Go to message</Button>
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
