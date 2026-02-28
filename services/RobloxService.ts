/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RobloxPrivateServerLink {
    type: "private";
    link: string;
    code: string;
    placeId: string;
}

export interface RobloxShareLink {
    type: "share";
    link: string;
    code: string;
}

export type RobloxLink = RobloxPrivateServerLink | RobloxShareLink;

// ─── Extração ─────────────────────────────────────────────────────────────────

export function extractServerLink(content: string): { ok: boolean; result: RobloxLink | null; reason: string; } {
    if (!content?.trim()) return { ok: false, result: null, reason: "no-content" };

    const normalized = content.toLowerCase();
    const shareMatch = /https?:\/\/(?:www\.)?roblox\.com\/share\?code=([a-f0-9]+)/i.exec(normalized);
    const privateMatch = /https?:\/\/(?:www\.)?roblox\.com\/games\/(\d+)(?:\/[^?]*)?\?privateserverlinkcode=([a-f0-9]+)/i.exec(normalized);

    const hasShare = Boolean(shareMatch);
    const hasPrivate = Boolean(privateMatch);

    if (hasShare && hasPrivate) return { ok: false, result: null, reason: "ambiguous" };
    if (!hasShare && !hasPrivate) return { ok: false, result: null, reason: "message-has-no-match" };

    if (hasShare && shareMatch) {
        return {
            ok: true,
            result: { type: "share", link: shareMatch[0] + "&type=Server", code: shareMatch[1] },
            reason: "",
        };
    }

    if (hasPrivate && privateMatch) {
        return {
            ok: true,
            result: { type: "private", link: privateMatch[0], code: privateMatch[2], placeId: privateMatch[1] },
            reason: "",
        };
    }

    return { ok: false, result: null, reason: "message-has-no-match" };
}

// ─── Sanitização ──────────────────────────────────────────────────────────────

// Regex que cobre todos os formatos de link Roblox que o plugin reconhece.
// Usado para remover os links do conteúdo antes do keyword matching,
// evitando que slugs como "Cyberspace" ou "Blood-Rain" disparem triggers acidentalmente.
const ROBLOX_LINK_PATTERN = /https?:\/\/(?:www\.)?roblox\.com\/(?:share\?code=[a-f0-9]+(?:&[^\s]*)?|games\/\d+(?:\/[^\s?]*)?(?:\?[^\s]*)?)/gi;

/**
 * Remove todos os links Roblox do conteúdo da mensagem.
 * Deve ser chamado antes de passar o conteúdo para o TriggerMatcher.
 *
 * Exemplo:
 *   "https://roblox.com/games/123/Sols-RNG-Cyberspace?privateServerLinkCode=abc rainy"
 *   → "rainy"
 */
export function stripRobloxLinks(content: string): string {
    return content.replace(ROBLOX_LINK_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

// ─── Join URI ─────────────────────────────────────────────────────────────────
// Ambos os tipos de link viram deeplinks diretos — sem chamada à API do Roblox.
//
// Share link  (/share?code=...)             → roblox://navigation/share_links?code=...&type=Server
// Private link (/games/{id}?privateSer...) → roblox://experiences/start?placeId={id}&linkCode=...
//
// Referência: https://devforum.roblox.com/t/parsing-deeplink-information-from-a-private-server-link-with-the-newer-format/3464724

export function buildJoinUri(link: RobloxLink): string {
    if (link.type === "share") {
        return `roblox://navigation/share_links?code=${link.code}&type=Server`;
    }
    return `roblox://experiences/start?placeId=${link.placeId}&linkCode=${link.code}`;
}
