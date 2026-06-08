/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { React, useState } from "@webpack/common";

import { TAG_CONFIGS } from "../../../stores/SnipeStore";
import { SnipeTag } from "../../../types";
import { Pill, PillVariant } from "../../ui/Pill";

const logger = new Logger("SolRadar.RecentJoins.components");

export const AVATAR_FALLBACK = "https://discord.com/assets/881ed827548f38c6.svg";

export const SUCCESS_TAGS = new Set<SnipeTag>(["link-verified-safe", "biome-verified-real"]);
export const DANGER_TAGS = new Set<SnipeTag>(["link-verified-unsafe", "biome-verified-bait", "failed"]);
export const WARN_TAGS = new Set<SnipeTag>(["biome-verified-timeout", "link-not-verified", "biome-not-verified"]);

/** Maps a SnipeTag to a PillVariant. */
export function tagToPillVariant(tag: SnipeTag): PillVariant {
    if (SUCCESS_TAGS.has(tag)) return "green";
    if (DANGER_TAGS.has(tag)) return "red";
    if (WARN_TAGS.has(tag)) return "yellow";
    return "muted";
}

export function TagBadge({ tag }: { tag?: SnipeTag; }) {
    if (!tag || !TAG_CONFIGS[tag]) {
        logger.warn("TagBadge received invalid tag:", tag);
        return null;
    }
    const config = TAG_CONFIGS[tag];

    return (
        <Pill
            variant={tagToPillVariant(tag)}
            size="small"
            radius="xs"
            border="subtle"
            emoji={config.emoji}
            title={config.detail}
        >
            {config.label}
        </Pill>
    );
}

export function FallbackImage({ src, style }: { src?: string; style?: React.CSSProperties; }) {
    const [imgSrc, setImgSrc] = useState(src || AVATAR_FALLBACK);
    React.useEffect(() => setImgSrc(src || AVATAR_FALLBACK), [src]);
    return <img src={imgSrc} alt="" onError={() => setImgSrc(AVATAR_FALLBACK)} style={style} />;
}

export function formatTimeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export function MessageTextarea({ value }: { value: string; }) {
    return (
        <textarea
            readOnly
            value={value}
            style={{
                width: "100%",
                resize: "vertical",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--background-mod-subtle)",
                background: "var(--background-tertiary)",
                color: "var(--text-default)",
                fontSize: 13,
                fontFamily: "var(--font-code)",
                lineHeight: 1.5,
                minHeight: 60,
                boxSizing: "border-box",
                outline: "none",
                scrollbarWidth: "thin",
            }}
        />
    );
}
