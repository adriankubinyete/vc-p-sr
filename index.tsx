/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildStore } from "@webpack/common";
import { PropsWithChildren } from "react";

import { SolsRadarChatBarButton } from "./components/buttons/SolsRadarChatBarButton";
import { SolsRadarTitleBarButton } from "./components/buttons/SolsRadarTitleBarButton";
import { SolsRadarIcon } from "./components/ui/SolsRadarIcon";
import { extractServerLink } from "./services/RobloxService";
import { getMatchingTrigger } from "./services/TriggerMatcher";
import { settings } from "./settings";
import { getActiveTriggers } from "./stores/TriggerStore";

const logger = new Logger("SolRadar");

export default definePlugin({
    name: "SRadar",
    description: "Does Sols RNG stuff",
    authors: [{ name: "masutty", id: 188851299255713792n }],
    settings,

    // render as titlebar
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

    // render as chatbar
    chatBarButton: {
        icon: SolsRadarIcon,
        render: SolsRadarChatBarButton,
    },

    async start() {
        logger.info("Starting");
    },

    async stop() {
        logger.info("Stopping");
    },

    flux: {
        async MESSAGE_CREATE({ message, optimistic }: { message: Message, optimistic: boolean; }) {
            if (optimistic) return;
            const logger = new Logger(`SolRadar:${message.id}`);

            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel || channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return;

            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return; // how

            if (settings.store.flattenEmbeds && message.embeds.length > 0) {
                let flattened = message.content;
                // logger.debug(`Flattening ${message.embeds.length} embeds.`); // spammy
                for (const embed of message.embeds) {
                    // for some reason theres no "raw" prefix here?
                    // checking with messagedata cmd shows "rawDescription" and "rawTitle"
                    // but the names here are different...? why?
                    // @ts-ignore
                    if (embed.title) flattened += ` ${embed.title}`;
                    // @ts-ignore
                    if (embed.description) flattened += ` ${embed.description}`;
                }
                message.content = flattened;
                message.embeds = [];
            }

            // 1. Tem link de Roblox?
            const link = extractServerLink(message.content);
            if (!link.ok) {
                // logger.debug("Invalid message.", { reason: link.reason });
                return;
            }
            // logger.debug("Valid Roblox link.", { type: link.result?.type, link: link.result?.link, code: link.result?.code });

            // 2. Tem triggers ativos?
            const activeTriggers = getActiveTriggers();
            if (!activeTriggers.length) {
                // logger.debug("❌ There are no active triggers.");
                return;
            }

            // 3. Avalia conditions e resolve ambiguidade
            const { trigger, status, allMatched } = getMatchingTrigger(message, activeTriggers);

            if (status === "ambiguous") {
                logger.debug(
                    `❌ Link discarded due to ambiguous message. (channel "${channel.name}" in guild "${guild.name}") (${allMatched.length} triggers matched: ` +
                    allMatched.map(t => t.name).join(", ") + ")"
                );
                return;
            }

            if (status === "none" || !trigger) {
                logger.debug(`❌ No triggers matched. (channel "${channel.name}" in guild "${guild.name}")`); // spammy
                return;
            }

            logger.info(`✅ MATCH! -> "${trigger.name}" (priority ${trigger.state.priority})`);

            // TODO:
            // - are we monitoring that channel? OR does the user has the bypass channel restriction?

            // - join the link
            // - if join happened, lock and notify etc........
            // prioritize join speed: join first

            // TODO: join lock, biome detection, autojoin, notify


            // bla bla verifica se message.content tem um link de roblox e se tiver, ve os trigger q essa msg apita
        }
    }
});


