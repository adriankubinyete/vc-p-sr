/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

import { buildJoinUri } from "../services/RobloxService";
import { SnipeMetrics, SnipeStore, SnipeTag } from "../stores/SnipeStore";
import { RobloxLink, Trigger } from "../types";

// ─── Snipe ────────────────────────────────────────────────────────────────────
//
// Handle de escrita para uma SnipeEntry no store.
// Criado quando uma mensagem bate em um trigger — carrega as referências
// vivas do ciclo (trigger, channel, guild, link), que não são serializadas.

export class Snipe {
    readonly id: number;
    readonly trigger: Trigger;
    readonly channel: Channel;
    readonly guild: Guild;
    readonly link: RobloxLink;
    readonly tMessageReceived: number;

    private constructor(
        id: number,
        trigger: Trigger,
        channel: Channel,
        guild: Guild,
        link: RobloxLink,
        tMessageReceived: number,
    ) {
        this.id = id;
        this.trigger = trigger;
        this.channel = channel;
        this.guild = guild;
        this.link = link;
        this.tMessageReceived = tMessageReceived;
    }

    static create(
        message: Message,
        link: RobloxLink,
        trigger: Trigger,
        channel: Channel,
        guild: Guild,
        tMessageReceived: number,
    ): Snipe {
        const author = UserStore.getUser(message.author.id);

        const id = SnipeStore.add({
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
            originalContent: link.link,
            joinUri: buildJoinUri(link),
        });

        return new Snipe(id, trigger, channel, guild, link, tMessageReceived);
    }

    // ── Link ──────────────────────────────────────────────────────────────────

    markAsLinkSafe() { this._tag("link-verified-safe"); }
    markAsLinkUnsafe() { this._tag("link-verified-unsafe"); }
    markAsLinkNotVerified() { this._tag("link-not-verified"); }

    isSafe(): boolean {
        const tags = SnipeStore.getById(this.id)?.tags ?? [];
        return tags.includes("link-verified-safe");
    }

    // ── Biome ─────────────────────────────────────────────────────────────────

    markAsBiomeReal() { this._tag("biome-verified-real"); }
    markAsBiomeBait() { this._tag("biome-verified-bait"); }
    markAsBiomeTimeout() { this._tag("biome-verified-timeout"); }
    markAsBiomeNotVerified() { this._tag("biome-not-verified"); }

    // ── Join ──────────────────────────────────────────────────────────────────

    markAsFailed() { this._tag("failed"); }

    setMetrics(metrics: SnipeMetrics) {
        SnipeStore.update(this.id, { metrics });
    }

    setJoinUri(uri: string) {
        SnipeStore.update(this.id, { joinUri: uri });
    }

    getJoinUri(): string | undefined {
        return SnipeStore.getById(this.id)?.joinUri;
    }

    // ── Interno ───────────────────────────────────────────────────────────────

    private _tag(...tags: SnipeTag[]) {
        SnipeStore.addTags(this.id, ...tags);
    }
}
