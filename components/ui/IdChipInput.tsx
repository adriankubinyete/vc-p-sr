/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./IdChipInput.css";

import { Button } from "@components/Button";
import { ChannelStore, GuildStore, React, TextInput, UserStore, useState } from "@webpack/common";

// --- Types ---

export type ChipKind = "user" | "channel" | "guild";

interface ResolvedUser { kind: "user"; id: string; name: string; discriminator?: string; avatarUrl?: string; }
interface ResolvedChannel { kind: "channel"; id: string; name: string; guildName?: string; guildIcon?: string; }
interface ResolvedGuild { kind: "guild"; id: string; name: string; iconUrl?: string; }
type ResolvedEntry = ResolvedUser | ResolvedChannel | ResolvedGuild;

type ResolveState =
    | { status: "idle"; }
    | { status: "resolved"; entry: ResolvedEntry; }
    | { status: "error"; message: string; };

// --- Resolver ---

export function resolveId(id: string, kind: ChipKind): ResolvedEntry | null {
    try {
        if (kind === "user") {
            const user = UserStore?.getUser(id);
            if (!user) return null;
            return {
                kind: "user", id,
                name: user.username ?? user.globalName ?? id,
                discriminator: user.discriminator !== "0" ? user.discriminator : undefined,
                avatarUrl: user.avatar
                    ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.webp?size=32`
                    : undefined,
            };
        } else if (kind === "guild") {
            const guild = GuildStore?.getGuild(id);
            if (!guild) return null;
            return {
                kind: "guild", id,
                name: guild.name ?? id,
                iconUrl: guild.icon
                    ? `https://cdn.discordapp.com/icons/${id}/${guild.icon}.webp?size=32`
                    : undefined,
            };
        } else {
            const channel = ChannelStore?.getChannel(id);
            if (!channel) return null;
            const guild = channel.guild_id ? GuildStore?.getGuild(channel.guild_id) : null;
            return {
                kind: "channel", id,
                name: channel.name ?? id,
                guildName: guild?.name,
                guildIcon: guild?.icon
                    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=32`
                    : undefined,
            };
        }
    } catch { return null; }
}

// --- IdChipInput ---

export function IdChipInput({ kind, label, hint, ids, onChange }: {
    kind: ChipKind;
    label: React.ReactNode;
    hint?: string;
    ids: string[];
    onChange: (ids: string[]) => void;
}) {
    const [inputVal, setInputVal] = useState("");
    const [state, setState] = useState<ResolveState>({ status: "idle" });

    const handleChange = (val: string) => {
        setInputVal(val);
        setState({ status: "idle" });
        const trimmed = val.trim();
        if (!/^\d{17,20}$/.test(trimmed)) return;
        if (ids.includes(trimmed)) { setState({ status: "error", message: "Already added." }); return; }
        const entry = resolveId(trimmed, kind);
        setState(entry ? { status: "resolved", entry } : {
            status: "error",
            message: kind === "user"
                ? "User not found in local cache. They need to be visible in your current session."
                : kind === "guild"
                    ? "Server not found in local cache. You need to be in this server."
                    : "Channel not found in local cache. Open the channel first so Discord loads it.",
        });
    };

    const handleAdd = () => {
        if (state.status !== "resolved") return;
        onChange([...ids, state.entry.id]);
        setInputVal("");
        setState({ status: "idle" });
    };

    return (
        <div className="vc-sora-chip-wrapper">
            {label && <span className="vc-sora-chip-label">{label}</span>}
            {hint && <span className="vc-sora-chip-hint">{hint}</span>}

            {ids.length > 0 && (
                <div className="vc-sora-chip-list">
                    {ids.map(id => {
                        const entry = resolveId(id, kind) ?? { kind, id, name: id } as ResolvedEntry;

                        const avatarUrl = entry.kind === "user"
                            ? (entry as ResolvedUser).avatarUrl
                            : entry.kind === "guild"
                                ? (entry as ResolvedGuild).iconUrl
                                : (entry as ResolvedChannel).guildIcon;

                        const isRound = entry.kind === "user";

                        const initial = (entry.kind === "channel"
                            ? ((entry as ResolvedChannel).guildName ?? entry.name)
                            : entry.name || "?"
                        ).charAt(0).toUpperCase();

                        const chipLabel = entry.kind === "user"
                            ? ((entry as ResolvedUser).discriminator
                                ? `${entry.name}#${(entry as ResolvedUser).discriminator}`
                                : entry.name)
                            : entry.kind === "guild"
                                ? entry.name
                                : `#${entry.name}`;

                        const sub = entry.kind === "channel" && (entry as ResolvedChannel).guildName
                            ? (entry as ResolvedChannel).guildName!
                            : entry.id;

                        return (
                            <div key={id} className="vc-sora-chip-entry">
                                {avatarUrl
                                    ? <img
                                        src={avatarUrl}
                                        alt=""
                                        className={`vc-sora-chip-avatar ${isRound ? "vc-sora-chip-avatar-round" : "vc-sora-chip-avatar-square"}`}
                                    />
                                    : <div className={`vc-sora-chip-initial ${isRound ? "vc-sora-chip-avatar-round" : "vc-sora-chip-avatar-square"}`}>
                                        {initial}
                                    </div>
                                }
                                <div className="vc-sora-chip-info">
                                    <div className="vc-sora-chip-name">{chipLabel}</div>
                                    <div className="vc-sora-chip-sub">{sub}</div>
                                </div>
                                <button
                                    className="vc-sora-chip-remove"
                                    onClick={() => onChange(ids.filter(i => i !== id))}
                                >×</button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="vc-sora-chip-input-row">
                <div>
                    <TextInput
                        value={inputVal}
                        placeholder={
                            kind === "user" ? "User ID (e.g. 188851299255713792)"
                                : kind === "guild" ? "Server ID (e.g. 123456789012345678)"
                                    : "Channel ID (e.g. 123456789012345678)"
                        }
                        onChange={handleChange}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleAdd()}
                    />
                </div>
                <Button size="small" variant="primary" disabled={state.status !== "resolved"} onClick={handleAdd}>
                    Add
                </Button>
            </div>

            {state.status === "resolved" && (
                <div className="vc-sora-chip-ready">✓ Ready to add</div>
            )}
            {state.status === "error" && (
                <p className="vc-sora-chip-error">⚠ {state.message}</p>
            )}
        </div>
    );
}
