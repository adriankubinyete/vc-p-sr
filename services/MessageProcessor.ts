/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";

import { Logger } from "../logger";
import { settings } from "../settings";
import { getActiveTriggers, KeywordSet } from "../stores/TriggerStore";
import { SnipableLink, Trigger } from "../types";
import { extractComponentUrls, parseCsv } from "../utils";

const logger = new Logger("SolRadar.MessageProcessor");

// --- Link extraction ---

// Every Roblox link format the plugin knows. Also used to strip links before keyword
// matching, so URL slugs like "Cyberspace" or "Blood-Rain" don't fire triggers.
const ROBLOX_LINK_PATTERN = /https?:\/\/(?:www\.)?roblox\.com\/(?:share\?code=[a-f0-9]+(?:&[^\s]*)?|games\/\d+(?:\/[^\s?]*)?(?:\?[^\s]*)?)/gi;
const SHARE_LINK_RE = /https?:\/\/(?:www\.)?roblox\.com\/share\?code=([a-f0-9]+)/i;
const PRIVATE_SERVER_RE = /https?:\/\/(?:www\.)?roblox\.com\/games\/(\d+)(?:\/[^?]*)?\?privateserverlinkcode=([a-f0-9]+)/i;
const JOINGUARD_RE = /https?:\/\/(?:www\.)?join-guard\.solsstattracker\.com\/([a-zA-Z0-9_]+)/i;

export function getSnipableLink(content: string): SnipableLink | null {
    if (!content?.trim()) return null;

    const normalized = content.trim();
    const shareMatch = SHARE_LINK_RE.exec(normalized);
    const privateMatch = PRIVATE_SERVER_RE.exec(normalized);
    const joinGuardMatch = JOINGUARD_RE.exec(normalized);

    const matches = [shareMatch, privateMatch, joinGuardMatch].filter(Boolean).length;

    if (matches === 0) return null;

    if (matches > 1 && !settings.store.resolveAmbiguousLinks) {
        logger.warn("Ambiguous message: multiple link types detected, skipping.");
        return null;
    }

    if (matches > 1) {
        const candidates: Array<{ index: number; result: SnipableLink; }> = [];
        if (shareMatch) candidates.push({ index: shareMatch.index, result: { type: "share", link: shareMatch[0] + "&type=Server", code: shareMatch[1] } });
        if (privateMatch) candidates.push({ index: privateMatch.index, result: { type: "private", link: privateMatch[0], code: privateMatch[2], placeId: privateMatch[1] } });
        if (joinGuardMatch && settings.store.interpretJoinguardLinks) candidates.push({ index: joinGuardMatch.index, result: { type: "joinguard", link: joinGuardMatch[0], code: joinGuardMatch[1] } });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.index - b.index);
        return candidates[0].result;
    }

    if (shareMatch) return { type: "share", link: shareMatch[0] + "&type=Server", code: shareMatch[1] };
    if (privateMatch) return { type: "private", link: privateMatch[0], code: privateMatch[2], placeId: privateMatch[1] };
    if (joinGuardMatch && settings.store.interpretJoinguardLinks) return { type: "joinguard", link: joinGuardMatch[0], code: joinGuardMatch[1] };

    return null;
}

export function stripSnipableLinks(content: string): string {
    return content.replace(ROBLOX_LINK_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

// --- Message pipeline ---

export function flattenEmbeds(message: Message): void {
    if (!settings.store.flattenEmbeds || !message.embeds.length) return;
    let flattened = message.content;
    for (const embed of message.embeds) {
        if (embed.type !== "rich") continue;

        // @ts-ignore flux events use title/description, the message store uses rawTitle/rawDescription
        const title = embed.rawTitle ?? embed.title;
        // @ts-ignore
        const description = embed.rawDescription ?? embed.description;
        if (title) flattened += ` ${title}`;
        if (description) flattened += ` ${description}`;

        if (settings.store.advancedEmbedFlattening) {
            if (embed.fields?.length) {
                for (const field of embed.fields) {
                    // @ts-ignore
                    const name = field.rawName ?? field.name;
                    // @ts-ignore
                    const value = field.rawValue ?? field.value;
                    if (name) flattened += ` ${name}`;
                    if (value) flattened += ` ${value}`;
                }
            }

            if (message.components?.length) {
                const urls = extractComponentUrls(message.components);
                for (const url of urls) {
                    flattened += ` ${url}`;
                }
            }
        }
    }
    message.content = flattened;
    message.embeds = [];
}

export function sanitizeContent(message: Message): void {
    message.content = stripSnipableLinks(message.content);
}

// --- Message filters ---

export function isValidMessage(message: Message): boolean {
    // @ts-ignore webhook_id is missing from the Message type
    const webhook_id = message.webhook_id ?? message.author.id ?? undefined;
    const isASelfForward = getActiveTriggers().some(t => {
        const url = t.forwarding.webhookUrl || settings.store.globalWebhookUrl;
        return url && webhook_id && url.includes(webhook_id);
    });

    if (isASelfForward) {
        logger.warn("This message is a self-forward!");
        return false;
    }

    const isReforward = message.embeds.some(e =>
        e.type === "rich" && (e as any).footer?.text?.toLowerCase() === "solradar"
    );

    if (isReforward && settings.store.ignoreWebhookForwards) {
        logger.warn("This message is a re-forward! Protection against forward loops is enabled.");
        return false;
    }

    return true;
}

export function isMessageAllowed(
    { channel, message, trigger }: { channel: Channel; message: Message; trigger: Trigger; },
): boolean {
    if (!trigger.conditions.bypassIgnoredGuilds) {
        const ignoredGuilds = parseCsv(settings.store.ignoredGuilds);
        if (ignoredGuilds.has(channel.guild_id)) {
            logger.debug(`[${trigger.name}] Guild ${channel.guild_id} is ignored, skipping.`);
            return false;
        }
    }

    if (trigger.conditions.ignoredGuilds.includes(channel.guild_id)) {
        logger.debug(`[${trigger.name}] Guild ${channel.guild_id} is ignored by trigger, skipping.`);
        return false;
    }

    if (!trigger.conditions.bypassIgnoredChannels) {
        const ignoredChannels = parseCsv(settings.store.ignoredChannels);
        if (ignoredChannels.has(channel.id)) {
            logger.debug(`[${trigger.name}] Channel #${channel.name} is ignored, skipping.`);
            return false;
        }
    }

    if (trigger.conditions.ignoredChannels.includes(channel.id)) {
        logger.debug(`[${trigger.name}] Channel #${channel.name} is ignored by trigger, skipping.`);
        return false;
    }

    const ignoredUsers = parseCsv(settings.store.ignoredUsers);
    if (ignoredUsers.has(message.author.id)) {
        logger.debug(`[${trigger.name}] User ${message.author.id} is ignored, skipping.`);
        return false;
    }

    if (!trigger.conditions.bypassMonitoredOnly) {
        const monitoredChannels = parseCsv(settings.store.monitoredChannels);
        const monitoredGuilds = parseCsv(settings.store.monitoredGuilds);

        const hasMonitors = monitoredChannels.size > 0 || monitoredGuilds.size > 0;
        const channelAllowed = monitoredChannels.has(channel.id);
        const guildAllowed = monitoredGuilds.has(channel.guild_id);

        if (hasMonitors && !channelAllowed && !guildAllowed) {
            logger.debug(`[${trigger.name}] Channel #${channel.name} / Guild ${channel.guild_id} not monitored, skipping.`);
            return false;
        }
    }

    return true;
}

// --- Trigger matching ---

function containsKeyword(text: string, keyword: string, strict: boolean): boolean {
    if (strict) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }
    return text.toLowerCase().includes(keyword.toLowerCase());
}

function evaluateKeywordSet(text: string, set: KeywordSet, matchMode: "require" | "exclude"): boolean {
    if (set.value.length === 0) return true;
    const found = set.value.some(kw => containsKeyword(text, kw, set.strict));
    return matchMode === "require" ? found : !found;
}

function evaluateTrigger(message: Message, trigger: Trigger): { matched: boolean; reason?: string; } {
    const { conditions } = trigger;
    const { content } = message;
    const authorId = message.author.id;
    const channelId = message.channel_id;

    // message.mentionRoles is unreliable (often undefined), so parse role mentions from the content
    const mentionRoles = [...content.matchAll(/<@&(\d+)>/g)].map(m => m[1]);

    if (conditions.fromUser.length > 0 && !conditions.fromUser.includes(authorId))
        return { matched: false, reason: `author ${authorId} not in fromUser list` };

    if (conditions.inChannel.length > 0 && !conditions.inChannel.includes(channelId))
        return { matched: false, reason: `channel ${channelId} not in inChannel list` };

    const hasKeywords = conditions.keywords.match.value.length > 0;
    const hasMentionRoles = conditions.mentionRoles.length > 0;

    if (hasKeywords || hasMentionRoles) {
        const keywordMatch = hasKeywords && evaluateKeywordSet(content, conditions.keywords.match, "require");
        const mentionMatch = hasMentionRoles && conditions.mentionRoles.some(r => mentionRoles.includes(r.id));
        if (!keywordMatch && !mentionMatch)
            return { matched: false, reason: "neither keywords nor mentionRoles matched" };
    }

    if (!evaluateKeywordSet(content, conditions.keywords.exclude, "exclude"))
        return { matched: false, reason: "excluded keyword found" };

    return { matched: true };
}

function getMatchingTrigger(message: Message, activeTriggers: Trigger[]): Trigger | null {
    const results = activeTriggers.map(t => ({ trigger: t, ...evaluateTrigger(message, t) }));
    const matched = results.filter(r => r.matched).map(r => r.trigger);

    if (matched.length === 0) return null;

    const bypass = matched.filter(t => t.conditions.bypassMatchAmbiguity);
    const normals = matched.filter(t => !t.conditions.bypassMatchAmbiguity);

    if (normals.length > 1) {
        logger.warn(
            `Ambiguous: ${normals.length} normal triggers matched: ` +
            normals.map(t => `"${t.name}"`).join(", ") +
            ". Discarding all normal triggers."
        );
    }

    const validNormals = normals.length === 1 ? normals : [];
    const candidates = [...bypass, ...validNormals];

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.state.priority - b.state.priority);
    const winner = candidates[0];

    logger.debug(
        `Winner: "${winner.name}" (p${winner.state.priority}, bypass=${winner.conditions.bypassMatchAmbiguity})` +
        (bypass.length > 0 ? ` | bypass: ${bypass.map(t => t.name).join(", ")}` : "")
    );

    return winner;
}

// --- Trigger resolution ---

export function resolveTrigger(
    { message, channel, guild }: { message: Message; channel: Channel; guild: Guild; },
): Trigger | null {
    const activeTriggers = getActiveTriggers();
    if (!activeTriggers.length) return null;

    return getMatchingTrigger(message, activeTriggers);
}
