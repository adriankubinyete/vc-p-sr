/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";
import { Channel, Guild, Message } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildStore } from "@webpack/common";
import { PropsWithChildren } from "react";

import { SolsRadarChatBarButton } from "./components/buttons/SolsRadarChatBarButton";
import { SolsRadarTitleBarButton } from "./components/buttons/SolsRadarTitleBarButton";
import { SolsRadarIcon } from "./components/ui/SolsRadarIcon";
import { Snipe } from "./models/Snipe";
import { BiomeDetector } from "./services/BiomeDetector";
import { closeGameIfNeeded, extractServerLink, getPlaceId, joinSolsPublicServer, joinUri, RobloxLink, stripRobloxLinks } from "./services/RobloxService";
import { getMatchingTrigger } from "./services/TriggerMatcher";
import { settings } from "./settings";
import { JoinLockStore } from "./stores/JoinLockStore";
import { SnipeMetrics, SnipeStore } from "./stores/SnipeStore";
import { getActiveTriggers, Trigger, TriggerType } from "./stores/TriggerStore";
import { parseCsv } from "./utils";

const logger = new Logger("SolRadar");
const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("./native")>;

// ─── pre processing ────────────────────────────────────────────────────────

function flattenEmbeds(message: Message): void {
    if (!settings.store.flattenEmbeds || !message.embeds.length) return;
    let flattened = message.content;
    for (const embed of message.embeds) {
        // @ts-ignore — campos sem prefixo "raw" no tipo, mas presentes em runtime
        if (embed.title) flattened += ` ${embed.title}`;
        // @ts-ignore
        if (embed.description) flattened += ` ${embed.description}`;
    }
    message.content = flattened;
    message.embeds = [];
}

function extractLink(message: Message): RobloxLink | null {
    const result = extractServerLink(message.content);
    return result.ok ? result.result! : null;
}

function sanitizeContent(message: Message): void {
    message.content = stripRobloxLinks(message.content);
}

function resolveTrigger({ message, channel, guild }: { message: Message; channel: Channel; guild: Guild; }, log: Logger): Trigger | null {
    const activeTriggers = getActiveTriggers();
    if (!activeTriggers.length) return null;

    const { trigger, status, allMatched } = getMatchingTrigger(message, activeTriggers);

    if (status === "ambiguous") {
        log.debug(
            `Ambiguous — ${allMatched.length} triggers matched: ${allMatched.map(t => t.name).join(", ")} ` +
            `(#${channel.name} @ ${guild.name})`
        );
        return null;
    }

    return trigger;
}

// ─── channel validation ───────────────────────────────────────────────────────

function isMessageAllowed({ channel, message, trigger }: { channel: Channel; message: Message; trigger: Trigger; }, log: Logger): boolean {
    // Guild-level ignore (com bypass por trigger)
    if (!trigger.conditions.bypassIgnoredGuilds) {
        const ignoredGuilds = parseCsv(settings.store.ignoredGuilds);
        if (ignoredGuilds.has(channel.guild_id)) {
            log.debug(`[${trigger.name}] Guild ${channel.guild_id} is ignored — skipping.`);
            return false;
        }
    }

    // Channel-level ignore (com bypass por trigger)
    if (!trigger.conditions.bypassIgnoredChannels) {
        const ignoredChannels = parseCsv(settings.store.ignoredChannels);
        if (ignoredChannels.has(channel.id)) {
            log.debug(`[${trigger.name}] Channel #${channel.name} is ignored — skipping.`);
            return false;
        }
    }

    // User-level ignore (sem bypass)
    const ignoredUsers = parseCsv(settings.store.ignoredUsers);
    if (ignoredUsers.has(message.author.id)) {
        log.debug(`[${trigger.name}] User ${message.author.id} is ignored — skipping.`);
        return false;
    }

    // Monitored channels whitelist
    if (!trigger.conditions.bypassMonitoredOnly) {
        const monitored = parseCsv(settings.store.monitoredChannels);
        if (monitored.size > 0 && !monitored.has(channel.id)) {
            log.debug(`[${trigger.name}] Channel #${channel.name} is not monitored — skipping.`);
            return false;
        }
    }

    return true;
}

// ─── join ─────────────────────────────────────────────────────────────────────

export interface JoinResult {
    joined: boolean;
    metrics: SnipeMetrics | null;
    linkSafe: boolean | undefined;
}

async function executeBadLinkAction(): Promise<void> {
    switch (settings.store.onBadLink) {
        case "nothing": return;
        case "public": return await joinSolsPublicServer();
        case "close": return await closeGameIfNeeded();
    }
}

async function verifyLink(link: RobloxLink, log: Logger): Promise<boolean | undefined> {

    if (!settings.store.robloxToken) {
        log.warn("Link verification enabled but robloxToken is missing.");
        showNotification({
            title: "⚠️ SoRa :: Link verification warning",
            body: "Link verification is enabled but robloxToken is missing.\nPlease configure a valid token or disable link verification to stop getting this notification.\nClick on this message to disable link verification.",
            onClick: () => settings.store.linkVerification = "disabled",
        });
        return false;
    }

    log.debug(`Verifying link ${JSON.stringify(link)}`);
    const placeId = await getPlaceId(link);
    const allowedPlaceIds = parseCsv(settings.store.allowedPlaceIds);

    if (allowedPlaceIds.size === 0 || allowedPlaceIds.has(String(placeId))) {
        log.debug(`Place ID ${placeId} is allowed.`);
        return true;
    }

    if (placeId === null) log.warn(`Failed to resolve link: ${link.code}`);

    await executeBadLinkAction();
    return false;
}

// ─── post-join ─────────────────────────────────────────────────────────────────

/** Tipos de trigger que suportam detecção de bioma via log. */
const BIOME_DETECTABLE_TYPES = new Set<TriggerType>(["RARE_BIOME", "EVENT_BIOME", "BIOME", "WEATHER"]);

function activateJoinLock(trigger: Trigger, log: Logger): void {
    if (!trigger.state.joinlock || trigger.state.joinlockDuration <= 0) return;

    const activated = JoinLockStore.activate(
        trigger.state.priority,
        trigger.state.joinlockDuration,
        trigger.name,
    );

    if (activated) {
        log.info(
            `[${trigger.name}] Join lock activated — ` +
            `priority: ${trigger.state.priority}, ` +
            `duration: ${trigger.state.joinlockDuration}s`
        );
    } else {
        log.debug(`[${trigger.name}] Join lock NOT updated — existing lock has higher priority.`);
    }
}

/**
 * Aguarda detecção de bioma via log do Roblox e atualiza o JoinStore com o resultado.
 * Fire-and-forget — não bloqueia handleMessage.
 * O cancel() é retornado para que o chamador possa cancelar se um novo join acontecer.
 */
function startBiomeDetection(
    snipe: Snipe,
    log: Logger,
): (() => void) | null {
    if (!snipe.trigger.biome?.detectionEnabled) {
        snipe.markAsBiomeNotVerified();
        return null;
    }

    if (!BIOME_DETECTABLE_TYPES.has(snipe.trigger.type)) {
        return null;
    }

    if (!settings.store.detectorEnabled) {
        log.debug(`[${snipe.trigger.name}] Biome detector globally disabled.`);
        snipe.markAsBiomeNotVerified();
        return null;
    }

    const expectedBiome = snipe.trigger.biome.detectionKeyword || snipe.trigger.name;
    const startDelayMs = settings.store.closeGameBeforeJoin ? 6_000 : 0;
    log.info(`[${snipe.trigger.name}] Awaiting biome detection — expecting "${expectedBiome}" (delay: ${startDelayMs}ms).`);

    const { promise, cancel } = BiomeDetector.waitForBiome(
        expectedBiome,
        settings.store.detectorTimeoutMs ?? 30_000,
        startDelayMs,
    );

    const t0 = performance.now();

    promise.then(verdict => {
        const elapsed = Math.round(performance.now() - t0);
        log.info(`[${snipe.trigger.name}] Biome verdict: ${verdict.result} (${elapsed}ms)`);

        switch (verdict.result) {
            case "real":
                snipe.markAsBiomeReal();
                _waitForBiomeEnd(snipe, log);
                showNotification({
                    title: `✅ SoRa :: Real — ${snipe.trigger.name}`,
                    body: `Detected in ${elapsed}ms`,
                    icon: snipe.trigger.iconUrl,
                });
                break;

            case "bait":
                snipe.markAsBiomeBait();
                if (JoinLockStore.isLocked) {
                    log.warn(`[${snipe.trigger.name}] Bait detected — releasing join lock.`);
                    JoinLockStore.release();
                }
                showNotification({
                    title: `❌ SoRa :: Fake — ${snipe.trigger.name}`,
                    body: `Got "${verdict.biome}" instead (${elapsed}ms)`,
                    icon: snipe.trigger.iconUrl,
                });
                break;

            case "timeout":
                snipe.markAsBiomeTimeout();
                log.warn(`[${snipe.trigger.name}] Biome detection timed out — releasing join lock.`);
                if (JoinLockStore.isLocked) JoinLockStore.release();
                showNotification({
                    title: `⏱ SoRa :: Timeout — ${snipe.trigger.name}`,
                    body: "Biome detection timed out.",
                    icon: snipe.trigger.iconUrl,
                });
                break;
        }
    });

    return cancel;
}

function _waitForBiomeEnd(snipe: Snipe, log: Logger): void {
    const { promise } = BiomeDetector.waitForBiome("__never_match__", 1_800_000);
    promise.then(() => {
        log.info(`[${snipe.trigger.name}] Biome ended — releasing join lock.`);
        JoinLockStore.release();
    });
}

// Active biome detection cancel function — cancels previous detection when a new join happens
let _cancelBiomeDetection: (() => void) | null = null;

function isJoinLocked(trigger: Trigger) {
    return JoinLockStore.isBlocked(trigger.state.priority);
}

// ─── join stuff ────────────────────────────────────────────────────────────────

function shouldJoin(snipe: Snipe): boolean {
    if (!settings.store.autoJoinEnabled) return false;
    if (!snipe.trigger.state.autojoin) return false;
    return true;
}

async function verifySnipeSafety(snipe: Snipe, log: Logger): Promise<void> {
    if (snipe.trigger.conditions.bypassLinkVerification) return;
    if (settings.store.linkVerification === "disabled") return;
    const safe = await verifyLink(snipe.link, log);

    if (safe === true) {
        snipe.markAsLinkSafe();
    } else if (safe === false) {
        snipe.markAsLinkUnsafe();
    } else {
        snipe.markAsLinkNotVerified();
    }

}

async function join(snipe: Snipe, log: Logger): Promise<void> {
    if (settings.store.linkVerification === "before") {
        await verifySnipeSafety(snipe, log);
        if (!snipe.isSafe()) return;
    }

    const uri = snipe.getJoinUri();
    if (!uri) {
        snipe.markAsFailed();
        return;
    }

    const metrics = await joinServer(uri, snipe.tMessageReceived, log);
    if (!metrics) {
        snipe.markAsFailed();
        return;
    }
    snipe.setMetrics(metrics);

    if (settings.store.linkVerification === "after") {
        await verifySnipeSafety(snipe, log);
        if (!snipe.isSafe()) return;
    }

    activateJoinLock(snipe.trigger, log);

    _cancelBiomeDetection?.();
    _cancelBiomeDetection = startBiomeDetection(snipe, log);

}

async function joinServer(uri: string, tMessageReceived: number, log: Logger): Promise<SnipeMetrics | null> {
    log.info(`Joining: ${uri}`);

    const tJoinStart = performance.now();
    try {
        await closeGameIfNeeded();
        await Native.openUri(uri);
    } catch (err) {
        log.error(`Native.openUri failed: ${(err as Error).message}`);
        return null;
    }
    const tJoinEnd = performance.now();

    const joinDurationMs = tJoinEnd - tJoinStart;
    const timeToJoinMs = tJoinEnd - tMessageReceived;
    const overheadMs = timeToJoinMs - joinDurationMs;

    return { timeToJoinMs, joinDurationMs, overheadMs };
}

// ─── notify stuff ──────────────────────────────────────────────────────────────

function shouldNotify(snipe: Snipe): boolean {
    if (!settings.store.notificationEnabled) return false;
    if (!snipe.trigger.state.notify) return false;
    return true;
}

function notify(snipe: Snipe, log: Logger): void {
    const entry = SnipeStore.getById(snipe.id)!;
    const tags = new Set(entry.tags);
    const onClick = entry.joinUri
        ? () => joinUri(entry.joinUri)
        : undefined;

    if (tags.has("link-verified-unsafe")) {
        showNotification({
            title: `⚠️ SoRa :: ${snipe.trigger.name} :: Unsafe link!`,
            body: `In: "${snipe.channel.name}" ("${snipe.guild.name}")`,
            icon: snipe.trigger.iconUrl,
            onClick,
        });
        return;
    }

    if (tags.has("failed")) {
        showNotification({
            title: `❌ SoRa :: Failed — ${snipe.trigger.name}`,
            body: `In: "${snipe.channel.name}" ("${snipe.guild.name}")`,
            icon: snipe.trigger.iconUrl,
        });
        return;
    }

    showNotification({
        title: entry.joinUri
            ? `🎯 SoRa :: Sniped — ${snipe.trigger.name}!`
            : `✅ SoRa :: Matched — ${snipe.trigger.name}!`,
        body: `In: "${snipe.channel.name}" ("${snipe.guild.name}")`,
        icon: snipe.trigger.iconUrl,
        onClick,
    });

    log.info(`[${snipe.trigger.name}] Notified: #${snipe.channel.name} @ ${snipe.guild.name}`);
}

// ─── orchestration ─────────────────────────────────────────────────────────────

async function handleMessage(message: Message, channel: Channel, guild: Guild, tMessageReceived: number): Promise<void> {
    const log = new Logger(`SolRadar:${message.id}`);

    flattenEmbeds(message);

    const link = extractLink(message);
    if (!link) return;

    sanitizeContent(message);

    const trigger = resolveTrigger({ message, channel, guild }, log);
    if (!trigger) return;

    log.info(`Match: "${trigger.name}" (p${trigger.state.priority}) — #${channel.name} @ ${guild.name}`);

    if (!isMessageAllowed({ channel, message, trigger }, log)) return;
    if (isJoinLocked(trigger)) return;

    const snipe = Snipe.create(message, link, trigger, channel, guild, tMessageReceived);

    if (shouldJoin(snipe)) await join(snipe, log);
    if (shouldNotify(snipe)) notify(snipe, log);

}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "SolRadar",
    description: "Does Sols RNG stuff",
    authors: [{ name: "masutty", id: 188851299255713792n }],
    settings,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=trailing:.{0,50})\i\.Fragment,\{(?=.+?className:(\i))/,
                replace: "$self.TitlebarWrapper,{className:$1,"
            },
            predicate: () => settings.store.pluginIconLocation === "titlebar",
        }
    ],

    TitlebarWrapper({ children, className }: PropsWithChildren<{ className: string; }>) {
        return (
            <>
                {children}
                <ErrorBoundary noop>
                    <SolsRadarTitleBarButton className={className} />
                </ErrorBoundary>
            </>
        );
    },

    chatBarButton: {
        icon: SolsRadarIcon,
        render: SolsRadarChatBarButton,
    },

    async start() {
        logger.info("Starting");

        if (settings.store.detectorEnabled) {
            const accounts = (settings.store.detectorAccounts as string ?? "")
                .split(",").map(s => s.trim()).filter(Boolean);

            if (accounts.length) {
                await BiomeDetector.configure(accounts);
                BiomeDetector.start(settings.store.detectorIntervalMs ?? 1_000);
            } else {
                logger.info("Biome detector enabled but no accounts configured.");
            }
        }
    },

    stop() {
        logger.info("Stopping");
        BiomeDetector.stop();
        _cancelBiomeDetection?.();
        _cancelBiomeDetection = null;
    },

    flux: {
        async MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic: boolean; }) {
            const tMessageReceived = performance.now();
            if (optimistic) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return;
            if (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return;

            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return;

            await handleMessage(message, channel, guild, tMessageReceived);
        }
    }
});
