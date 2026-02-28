/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
import { buildJoinUri, extractServerLink, RobloxLink, stripRobloxLinks } from "./services/RobloxService";
import { getMatchingTrigger } from "./services/TriggerMatcher";
import { settings } from "./settings";
import { getActiveTriggers, Trigger } from "./stores/TriggerStore";

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

/**
 * Remove os links Roblox do conteúdo da mensagem antes do matching.
 * Evita que slugs como "Sols-RNG-Cyberspace" disparem o trigger "cyber".
 * Deve ser chamado APÓS extractLink (que precisa do link intacto).
 */
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

/**
 * Decides if a channel is allowed to be scanned.
 *
 */
function isMessageAllowed({ channel, trigger }: { channel: Channel; trigger: Trigger; }, log: Logger): boolean {

    // glitch hunting servers with "dont use snipers" policy
    const blacklist = parseCsv(settings.store.NEVER_MONITOR_THESE_GUILDS);
    if (blacklist.has(channel.guild_id)) {
        log.debug(`[${trigger.name}] Guild ${channel.guild_id} is blacklisted — skipping.`);
        return false;
    }

    if (trigger.conditions.bypassChannelRestriction) {
        log.debug(`[${trigger.name}] Channel restriction bypassed.`);
        return true;
    }

    const whitelist = parseCsv(settings.store.monitoredChannels);
    if (!whitelist.has(channel.id)) {
        log.debug(`[${trigger.name}] Channel #${channel.name} is not monitored — skipping.`);
        return false;
    }

    return true;
}

// ─── join ─────────────────────────────────────────────────────────────────────

/**
 * Tenta fazer join no servidor Roblox associado ao link.
 *
 * Respeita:
 *  - settings.store.autoJoinEnabled (gate global)
 *  - trigger.state.autojoin (gate por trigger)
 */
async function tryJoin(link: RobloxLink, trigger: Trigger, log: Logger): Promise<boolean> {
    if (!settings.store.autoJoinEnabled) {
        log.debug(`[${trigger.name}] Auto-join globally disabled — skipping join.`);
        return false;
    }

    if (!trigger.state.autojoin) {
        log.debug(`[${trigger.name}] Auto-join disabled on this trigger — skipping join.`);
        return false;
    }

    const uri = buildJoinUri(link);
    log.info(`[${trigger.name}] Joining: ${uri}`);

    try {
        await Native.openUri(uri);
        return true;
    } catch (err) {
        log.error(`[${trigger.name}] openUri failed: ${(err as Error).message}`);
        return false;
    }
}

// ─── post-join ─────────────────────────────────────────────────────────────────

function activateJoinLock(trigger: Trigger, log: Logger): void {
    if (!trigger.state.joinlock) return;
    // TODO: persistir timestamp do lock + duration
    log.info(`[${trigger.name}] Join lock activated for ${trigger.state.joinlock_duration}s.`);
}

async function runBiomeDetection(trigger: Trigger, log: Logger): Promise<void> {
    if (!trigger.biome?.detection_enabled) return;
    // TODO: ler log do Roblox e verificar detection_keyword
    log.debug(`[${trigger.name}] Biome detection pending.`);
}

/**
 * Envia notificação de match.
 *
 * Respeita:
 *  - settings.store.notificationEnabled (gate global)
 *  - trigger.state.notify (gate por trigger)
 */
function tryNotify(trigger: Trigger, channel: Channel, guild: Guild, log: Logger): void {
    if (!settings.store.notificationEnabled) {
        log.debug(`[${trigger.name}] Notifications globally disabled — skipping.`);
        return;
    }

    if (!trigger.state.notify) {
        log.debug(`[${trigger.name}] Notifications disabled on this trigger — skipping.`);
        return;
    }

    // TODO: mostrar toast / notificação do sistema
    log.info(`[${trigger.name}] Notify: matched in #${channel.name} @ ${guild.name}.`);
}

// ─── orchestration ─────────────────────────────────────────────────────────────

async function handleMessage(message: Message, channel: Channel, guild: Guild): Promise<void> {
    const log = new Logger(`SolRadar:${message.id}`);

    flattenEmbeds(message);

    const link = extractLink(message);
    if (!link) return;

    sanitizeContent(message); // remove links before matching so it doesnt affect keyword matching

    const trigger = resolveTrigger({ message, channel, guild }, log);
    if (!trigger) return;

    log.info(`Match: "${trigger.name}" (p${trigger.state.priority}) — #${channel.name} @ ${guild.name}`);

    if (!isMessageAllowed({ channel, trigger }, log)) return; // channel and guild restrictions

    const joined = await tryJoin(link, trigger, log);
    tryNotify(trigger, channel, guild, log); // independent of join

    if (!joined) return;

    // post-join stuff not implemented yet
    // activateJoinLock(trigger, log);
    // await runBiomeDetection(trigger, log);
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

    async start() { logger.info("Starting"); },
    async stop() { logger.info("Stopping"); },

    flux: {
        async MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic: boolean; }) {
            if (optimistic) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return;
            if (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return;

            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return;

            await handleMessage(message, channel, guild);
        }
    }
});
