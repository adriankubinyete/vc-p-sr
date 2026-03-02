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
import { ChannelStore, GuildStore, UserStore } from "@webpack/common";
import { PropsWithChildren } from "react";

import { SolsRadarChatBarButton } from "./components/buttons/SolsRadarChatBarButton";
import { SolsRadarTitleBarButton } from "./components/buttons/SolsRadarTitleBarButton";
import { SolsRadarIcon } from "./components/ui/SolsRadarIcon";
import { BiomeDetector } from "./services/BiomeDetector";
import { buildJoinUri, closeGameIfNeeded, extractServerLink, getPlaceId, joinSolsPublicServer, RobloxLink, stripRobloxLinks } from "./services/RobloxService";
import { getMatchingTrigger } from "./services/TriggerMatcher";
import { settings } from "./settings";
import { JoinLockStore } from "./stores/JoinLockStore";
import { JoinMetrics, JoinStore } from "./stores/JoinStore";
import { getActiveTriggers, Trigger, TriggerType } from "./stores/TriggerStore";

const logger = new Logger("SolRadar");
const Native = VencordNative.pluginHelpers.SRadar as PluginNative<typeof import("./native")>;

// ─── settings helpers ──────────────────────────────────────────────────────

/** CSV "123,456,789" → Set<string> */
function parseCsv(csv: string | undefined): Set<string> {
    if (!csv?.trim()) return new Set();
    return new Set(csv.split(",").map(s => s.trim()).filter(Boolean));
}

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
    metrics: JoinMetrics | null;
    linkSafe: boolean | undefined;
}

async function executeBadLinkAction(): Promise<void> {
    switch (settings.store.onBadLink) {
        case "nothing": return;
        case "public": return await joinSolsPublicServer();
        case "close": return await closeGameIfNeeded();
    }
}

async function verifyLink(link: RobloxLink, trigger: Trigger, log: Logger): Promise<boolean | undefined> {
    if (trigger.conditions.bypassLinkVerification) {
        log.debug(`[${trigger.name}] Link verification bypassed.`);
        return undefined;
    }

    const mode = settings.store.linkVerification as "disabled" | "before" | "after" | undefined ?? "disabled";
    if (mode === "disabled") return undefined;

    if (!settings.store.robloxToken) {
        log.warn("Link verification enabled but robloxToken is missing.");
        showNotification({
            title: "⚠️ SoRa :: Link verification warning",
            body: "Link verification is enabled but robloxToken is missing.\nPlease configure a valid token or disable link verification to stop getting this notification.\nClick on this message to disable link verification.",
            onClick: () => settings.store.linkVerification = "disabled",
        });
        return false;
    }

    log.debug(`[${trigger.name}] Verifying link ${JSON.stringify(link)}`);
    const placeId = await getPlaceId(link);
    const allowedPlaceIds = parseCsv(settings.store.allowedPlaceIds);

    if (allowedPlaceIds.size === 0 || allowedPlaceIds.has(String(placeId))) {
        log.debug(`[${trigger.name}] Place ID ${placeId} is allowed.`);
        return true;
    }

    if (placeId === null) log.warn(`[${trigger.name}] Failed to resolve link: ${link.code}`);

    await executeBadLinkAction();
    return false;
}

async function tryJoin(
    link: RobloxLink,
    trigger: Trigger,
    log: Logger,
    tMessageReceived: number
): Promise<JoinResult> {
    const noJoin: JoinResult = { joined: false, metrics: null, linkSafe: undefined };

    if (!settings.store.autoJoinEnabled) {
        log.debug(`[${trigger.name}] Auto-join globally disabled.`);
        return noJoin;
    }
    if (!trigger.state.autojoin) {
        log.debug(`[${trigger.name}] Auto-join disabled on this trigger.`);
        return noJoin;
    }

    if ((settings.store.linkVerification as string) === "before") {
        const safe = await verifyLink(link, trigger, log);
        if (safe === false) {
            log.warn(`[${trigger.name}] Link flagged as unsafe — aborting join.`);
            return { joined: false, metrics: null, linkSafe: false };
        }
    }

    const uri = buildJoinUri(link);
    log.info(`[${trigger.name}] Joining: ${uri}`);

    const tJoinStart = performance.now();
    try {
        await closeGameIfNeeded();
        await Native.openUri(uri);
    } catch (err) {
        log.error(`[${trigger.name}] openUri failed: ${(err as Error).message}`);
        return noJoin;
    }
    const tJoinEnd = performance.now();

    const joinDurationMs = tJoinEnd - tJoinStart;
    const timeToJoinMs = tJoinEnd - tMessageReceived;
    const overheadMs = timeToJoinMs - joinDurationMs;

    const metrics: JoinMetrics = { timeToJoinMs, joinDurationMs, overheadMs };
    log.info(
        `[${trigger.name}] Join complete — ` +
        `total: ${timeToJoinMs.toFixed(1)}ms | ` +
        `openUri: ${joinDurationMs.toFixed(1)}ms | ` +
        `overhead: ${overheadMs.toFixed(1)}ms`
    );

    let linkSafe: boolean | undefined = undefined;
    if ((settings.store.linkVerification as string) === "after") {
        linkSafe = await verifyLink(link, trigger, log);
    }

    return { joined: true, metrics, linkSafe };
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
    trigger: Trigger,
    joinId: number,
    log: Logger,
): (() => void) | null {
    if (!trigger.biome?.detectionEnabled) {
        JoinStore.addTags(joinId, "biome-not-verified");
        return null;
    }

    if (!BIOME_DETECTABLE_TYPES.has(trigger.type)) {
        JoinStore.addTags(joinId, "biome-not-verified");
        return null;
    }

    if (!settings.store.detectorEnabled) {
        log.debug(`[${trigger.name}] Biome detector globally disabled.`);
        JoinStore.addTags(joinId, "biome-not-verified");
        return null;
    }

    const expectedBiome = trigger.biome.detectionKeyword || trigger.name;
    const startDelayMs = settings.store.closeGameBeforeJoin ? 6_000 : 0;
    log.info(`[${trigger.name}] Awaiting biome detection — expecting "${expectedBiome}" (delay: ${startDelayMs}ms).`);

    const { promise, cancel } = BiomeDetector.waitForBiome(
        expectedBiome,
        settings.store.detectorTimeoutMs ?? 30_000,
        startDelayMs,
    );

    const t0 = performance.now();

    promise.then(verdict => {
        const elapsed = Math.round(performance.now() - t0);
        log.info(`[${trigger.name}] Biome verdict: ${verdict.result} (${elapsed}ms)`);

        switch (verdict.result) {
            case "real":
                JoinStore.addTags(joinId, "biome-verified-real");
                _waitForBiomeEnd(trigger, log);
                showNotification({
                    title: `✅ SoRa :: Real — ${trigger.name}`,
                    body: `Detected in ${elapsed}ms`,
                    icon: trigger.iconUrl,
                });
                break;

            case "bait":
                JoinStore.addTags(joinId, "biome-verified-bait");
                if (JoinLockStore.isLocked) {
                    log.warn(`[${trigger.name}] Bait detected — releasing join lock.`);
                    JoinLockStore.release();
                }
                showNotification({
                    title: `❌ SoRa :: Fake — ${trigger.name}`,
                    body: `Got "${verdict.biome}" instead (${elapsed}ms)`,
                    icon: trigger.iconUrl,
                });
                break;

            case "timeout":
                JoinStore.addTags(joinId, "biome-verified-timeout");
                log.warn(`[${trigger.name}] Biome detection timed out — releasing join lock.`);
                if (JoinLockStore.isLocked) JoinLockStore.release();
                showNotification({
                    title: `⏱ SoRa :: Timeout — ${trigger.name}`,
                    body: "Biome detection timed out.",
                    icon: trigger.iconUrl,
                });
                break;
        }
    });

    return cancel;
}

function _waitForBiomeEnd(trigger: Trigger, log: Logger): void {
    const { promise } = BiomeDetector.waitForBiome("__never_match__", 1_800_000);
    promise.then(() => {
        log.info(`[${trigger.name}] Biome ended — releasing join lock.`);
        JoinLockStore.release();
    });
}

function tryNotify({ trigger, channel, guild, joined, safe }: { trigger: Trigger; channel: Channel; guild: Guild; joined: boolean; safe: boolean | undefined; }, log: Logger): void {
    if (!settings.store.notificationEnabled) {
        log.debug(`[${trigger.name}] Notifications globally disabled.`);
        return;
    }
    if (!trigger.state.notify) {
        log.debug(`[${trigger.name}] Notifications disabled on this trigger.`);
        return;
    }

    if (safe === false && joined) {
        showNotification({
            title: `⚠️ SoRa :: ${trigger.name} :: Unsafe link!`,
            body: `In: "${channel.name}" ("${guild.name}")`,
            icon: trigger.iconUrl,
        });
        return;
    }

    showNotification({
        title: joined ? `🎯 SoRa :: Joined "${trigger.name}"!` : `✅ SoRa :: Matched "${trigger.name}"!`,
        body: `In: "${channel.name}" ("${guild.name}")`,
        icon: trigger.iconUrl,
    });

    log.info(`[${trigger.name}] Notify: matched in #${channel.name} @ ${guild.name}.`);
}

// ─── JoinStore integration ────────────────────────────────────────────────────

/**
 * Cria uma entrada no JoinStore assim que o match é confirmado,
 * antes do join acontecer — para que o histórico capture até os casos
 * onde autojoin está desativado.
 * Retorna o joinId para que as tags possam ser adicionadas progressivamente.
 */
function createJoinRecord(
    message: Message,
    link: RobloxLink,
    trigger: Trigger,
    channel: Channel,
    guild: Guild
): number {
    const author = UserStore.getUser(message.author.id);

    return JoinStore.add({
        triggerName: trigger.name,
        triggerType: trigger.type,
        triggerPriority: trigger.state.priority,
        iconUrl: trigger.iconUrl,
        authorName: message.author.username,
        authorAvatarUrl: author?.getAvatarURL?.() ?? undefined,
        authorId: message.author.id,
        channelName: channel.name,
        guildName: guild.name,
        messageJumpUrl: `https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`,
        originalContent: link.link, // o link original, antes do sanitize
    });
}

/**
 * Resolve as tags finais baseado no resultado do join e na verificação de link.
 * Chamado após tryJoin retornar.
 */
function finalizeJoinRecord(
    joinId: number,
    result: JoinResult,
    log: Logger
): void {
    if (!result.joined) {
        JoinStore.addTags(joinId, result.linkSafe === false ? "link-verified-unsafe" : "failed");
        return;
    }

    // join aconteceu — salva métricas e resolve tags de link
    JoinStore.update(joinId, { metrics: result.metrics ?? undefined });

    if (result.linkSafe === true) JoinStore.addTags(joinId, "link-verified-safe");
    else if (result.linkSafe === false) JoinStore.addTags(joinId, "link-verified-unsafe");
    else JoinStore.addTags(joinId, "link-not-verified");

    log.debug(`Join record ${joinId} finalized.`);
}

// Active biome detection cancel function — cancels previous detection when a new join happens
let _cancelBiomeDetection: (() => void) | null = null;

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

    // ── Join lock check ───────────────────────────────────────────────────────
    if (JoinLockStore.isBlocked(trigger.state.priority)) {
        const lock = JoinLockStore.current!;
        log.info(
            `[${trigger.name}] Blocked by join lock ` +
            `(lock: "${lock.triggerName}", priority: ${lock.priority}, ` +
            `expires in ${(JoinLockStore.msRemaining() / 1000).toFixed(1)}s)`
        );
        return;
    }

    const joinId = createJoinRecord(message, link, trigger, channel, guild);

    const result = await tryJoin(link, trigger, log, tMessageReceived);

    tryNotify({ trigger, channel, guild, joined: result.joined, safe: result.linkSafe }, log);

    finalizeJoinRecord(joinId, result, log);

    if (!result.joined || result.linkSafe === false) return;

    // ── Activate join lock ────────────────────────────────────────────────────
    activateJoinLock(trigger, log);

    // ── Biome detection ───────────────────────────────────────────────────────
    // Cancel any pending detection from a previous join
    _cancelBiomeDetection?.();
    _cancelBiomeDetection = startBiomeDetection(trigger, joinId, log);
}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "SRadar",
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
