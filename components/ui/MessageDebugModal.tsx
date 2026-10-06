/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CodeBlock } from "@components/CodeBlock";
import { Divider } from "@components/Divider";
import { Channel, Guild, Message } from "@vencord/discord-types";
import { React } from "@webpack/common";

import { flattenEmbeds, getSnipableLink, isMessageAllowed, isValidMessage, resolveTrigger, sanitizeContent } from "../../services/MessageProcessor";
import { settings } from "../../settings";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "./LegacyModal";

// --- Styles ---

const headerTitle: React.CSSProperties = { fontWeight: 700, fontSize: "1rem", flex: 1, color: "var(--text-default)" };
const sectionLabel: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" };

// --- Analysis ---

interface DebugStep {
    label: string;
    ok: boolean;
    detail: React.ReactNode;
}

interface AnalysisResult {
    steps: DebugStep[];
    interpretedContent: string;
}

function analyze(_message: Message, channel: Channel, guild: Guild): AnalysisResult {
    const steps: DebugStep[] = [];
    const message = { ..._message, embeds: [..._message.embeds] } as Message; // copy, so the analysis never changes the real message

    const isNativeForward = Array.isArray((_message as any).messageSnapshots) && (_message as any).messageSnapshots.length > 0;
    if (isNativeForward) {
        steps.push({
            label: "Discord forward",
            ok: false,
            detail: "This is a natively forwarded message (messageSnapshots detected). The plugin only processes original messages. Forwarded messages are ignored.",
        });
        return { steps, interpretedContent: message.content };
    }

    const valid = isValidMessage(message);
    steps.push({
        label: "Message validity",
        ok: valid,
        detail: valid
            ? "Not a self-forward or re-forward."
            : "Matches the self-forward or re-forward filter, so it would be silently ignored.",
    });
    if (!valid) return { steps, interpretedContent: message.content };

    const contentBefore = message.content;
    flattenEmbeds(message);
    if (message.content !== contentBefore) {
        steps.push({
            label: "Interpret Embeds",
            ok: true,
            detail: "Embed content merged into message.",
        });
    }

    const interpretedContent = message.content;

    const link = getSnipableLink(message.content);

    const hasShareLink = /roblox\.com\/share\?code=/i.test(interpretedContent);
    const hasPrivateLink = /roblox\.com\/games\/\d+[^?]*\?privateserverlinkcode=/i.test(interpretedContent);
    const hasJoinguardLink = /join-guard\.solsstattracker\.com\//i.test(interpretedContent);
    const multipleTypes = [hasShareLink, hasPrivateLink, hasJoinguardLink].filter(Boolean).length > 1;

    const noLinkHints: string[] = [];
    if (_message.embeds.length > 0 && !settings.store.flattenEmbeds)
        noLinkHints.push("This message has embeds. Enable \"Interpret Embeds\" in Snipe Configuration.");
    else if (_message.embeds.length > 0 && settings.store.flattenEmbeds && !settings.store.advancedEmbedFlattening)
        noLinkHints.push("Embeds were interpreted but the link wasn't found. If it's inside embed fields or buttons, enable \"Advanced Embed Flattening\" in Advanced settings.");
    if (multipleTypes && !settings.store.resolveAmbiguousLinks)
        noLinkHints.push("Multiple link types detected. Enable \"Force Match on Multiple Links\" in Snipe Configuration.");

    steps.push({
        label: "Link detection",
        ok: !!link,
        detail: link
            ? `${link.type.toUpperCase()} link, code: ${link.code}${link.type === "private" ? `, place: ${link.placeId}` : ""}`
            : noLinkHints.length > 0
                ? <>{noLinkHints.map((h, i) => <div key={i} style={{ marginTop: i > 0 ? 3 : 0 }}>• {h}</div>)}</>
                : "No Roblox link found in this message.",
    });
    if (!link) return { steps, interpretedContent };

    sanitizeContent(message);

    const trigger = resolveTrigger({ message, channel, guild });
    steps.push({
        label: "Trigger match",
        ok: !!trigger,
        detail: trigger
            ? `Matched "${trigger.name}" (priority ${trigger.state.priority})`
            : "No active trigger matched this message.",
    });
    if (!trigger) return { steps, interpretedContent };

    const allowed = isMessageAllowed({ channel, message, trigger });
    steps.push({
        label: "Message filters",
        ok: allowed,
        detail: allowed
            ? "Not blocked by any global filter."
            : "Blocked - check ignored guilds, channels, users, or monitored channels.",
    });
    if (!allowed) return { steps, interpretedContent };

    const globalJoin = settings.store.autoJoinEnabled;
    const triggerJoin = trigger.state.autojoin;
    steps.push({
        label: "Auto-join",
        ok: globalJoin && triggerJoin,
        detail: !globalJoin
            ? "Globally disabled. Enable Auto-joins in General settings."
            : !triggerJoin
                ? `Disabled on trigger "${trigger.name}".`
                : "Enabled.",
    });

    return { steps, interpretedContent };
}

// --- Modal ---

function DebugModal({ props, message, channel, guild }: {
    props: ModalProps;
    message: Message;
    channel: Channel;
    guild: Guild;
}) {
    const { steps, interpretedContent } = React.useMemo(() => analyze(message, channel, guild), []);
    const detectionSteps = steps.filter(s => s.label !== "Auto-join");
    const wouldSnipe = detectionSteps.length > 0 && detectionSteps.every(s => s.ok);

    return (
        <ModalRoot {...props} size={ModalSize.SMALL}>
            <ModalHeader>
                <span style={headerTitle}>SolRadar Snipe Debug</span>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>
            <Divider />
            <ModalContent style={{ padding: "0.75rem", paddingBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>

                <span style={sectionLabel}>Interpreted Content (max 300 chars)</span>
                <div style={{ marginBottom: 4 }}>
                    <CodeBlock content={interpretedContent?.slice(0, 300) || "(no content)"} lang="" />
                </div>

                <span style={{ ...sectionLabel, marginTop: 4 }}>Pipeline</span>
                {steps.map((step, i) => (
                    <div key={i} style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "var(--background-mod-subtle)",
                    }}>
                        <span style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: step.ok ? "var(--status-positive)" : "var(--status-danger)",
                            flexShrink: 0,
                            marginTop: 1,
                        }}>
                            {step.ok ? "✓" : "✗"}
                        </span>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-default)" }}>
                                {step.label}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                {step.detail}
                            </div>
                        </div>
                    </div>
                ))}

                <div style={{
                    marginTop: 4,
                    marginBottom: "0.75rem",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: wouldSnipe ? "hsl(139deg 47% 43% / 15%)" : "hsl(359deg 82% 58% / 12%)",
                    border: `1px solid ${wouldSnipe ? "hsl(139deg 47% 43% / 30%)" : "hsl(359deg 82% 58% / 25%)"}`,
                    color: wouldSnipe ? "var(--status-positive)" : "var(--status-danger)",
                    fontSize: 13,
                    fontWeight: 600,
                }}>
                    {wouldSnipe ? "✓ This message would trigger a snipe." : "✗ This message would not trigger a snipe."}
                </div>

            </ModalContent>
        </ModalRoot>
    );
}

// --- Entry point ---

export function openMessageDebugModal(message: Message, channel: Channel, guild: Guild) {
    openModal(props => (
        <DebugModal props={props} message={message} channel={channel} guild={guild} />
    ));
}
