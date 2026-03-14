/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { findByPropsLazy } from "@webpack";
import { React, Select, showToast, TextInput, Toasts, useEffect, useState } from "@webpack/common";

import { settings } from "../../../../settings";
import {
    addTrigger,
    DEFAULT_BIOME,
    deleteTrigger,
    makeDefaultTrigger,
    Trigger,
    TriggerBiome,
    TriggerConditions,
    TriggerForwarding,
    TriggerType,
    updateTrigger,
} from "../../../../stores/TriggerStore";

// ─── Discord stores (lazy) ────────────────────────────────────────────────────

const UserStore = findByPropsLazy("getUser", "getCurrentUser");
const ChannelStore = findByPropsLazy("getChannel", "getDMFromUserId");
const GuildStore = findByPropsLazy("getGuild", "getGuildCount");

// ─── Helpers ──────────────────────────────────────────────────────────────────

type InnerTab = "general" | "conditions" | "biome" | "forwarding" | "advanced";

const TRIGGER_TYPE_OPTIONS = [
    { label: "Rare Biome", value: "RARE_BIOME" },
    { label: "Event Biome", value: "EVENT_BIOME" },
    { label: "Biome", value: "BIOME" },
    { label: "Weather", value: "WEATHER" },
    { label: "Merchant", value: "MERCHANT" },
    { label: "Custom", value: "CUSTOM" },
];

const needsBiomeTab = (type: TriggerType) =>
    type === "RARE_BIOME" || type === "EVENT_BIOME" || type === "BIOME" || type === "WEATHER" || type === "CUSTOM";

const arrToStr = (arr: string[]) => arr.join(", ");
const strToArr = (str: string): string[] => str.split(",").map(s => s.trim()).filter(Boolean);

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
    sectionTitle: {
        color: "var(--control-secondary-text-default)",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 4,
        marginTop: 20,
    } as React.CSSProperties,

    sectionDescription: {
        color: "var(--text-muted)",
        fontSize: 13,
        margin: "8px 0",
        lineHeight: 1.4,
    } as React.CSSProperties,

    row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-mod-subtle)",
    } as React.CSSProperties,

    rowStacked: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-mod-subtle)",
    } as React.CSSProperties,

    rowLeft: {
        display: "flex",
        flexDirection: "column",
        gap: 3,
        flex: 1,
        minWidth: 0,
    } as React.CSSProperties,

    label: {
        color: "var(--control-secondary-text-default)",
        fontSize: 14,
        fontWeight: 500,
    } as React.CSSProperties,

    hint: {
        color: "var(--text-muted)",
        fontSize: 12,
        lineHeight: 1.4,
        marginTop: 2,
    } as React.CSSProperties,

    select: {
        background: "var(--background-tertiary)",
        border: "1px solid var(--background-mod-subtle)",
        borderRadius: 4,
        color: "var(--text-default)",
        fontSize: 13,
        padding: "5px 8px",
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: 220,
    } as React.CSSProperties,

    note: {
        color: "var(--text-muted)",
        background: "var(--background-mod-subtle)",
        fontSize: 12,
        lineHeight: 1.5,
        padding: "8px 12px",
        borderRadius: 6,
        margin: 0,
    } as React.CSSProperties,

    noteWarning: {
        color: "var(--status-warning)",
        background: "hsl(38deg 95% 54% / 10%)",
        border: "1px solid hsl(38deg 95% 54% / 25%)",
        fontSize: 12,
        lineHeight: 1.5,
        padding: "8px 12px",
        borderRadius: 6,
        margin: 0,
    } as React.CSSProperties,

    noteDanger: {
        color: "var(--text-feedback-critical)",
        background: "hsl(359deg 87% 54% / 10%)",
        border: "1px solid hsl(359deg 87% 54% / 25%)",
        fontSize: 12,
        lineHeight: 1.5,
        padding: "8px 12px",
        borderRadius: 6,
        margin: 0,
    } as React.CSSProperties,

    noteSuccess: {
        color: "hsl(140deg 50% 50%)",
        background: "hsl(140deg 50% 50% / 10%)",
        border: "1px solid hsl(140deg 50% 50% / 25%)",
        fontSize: 12,
        lineHeight: 1.5,
        padding: "8px 12px",
        borderRadius: 6,
        margin: 0,
    } as React.CSSProperties,
};

// ─── Primitive field components ───────────────────────────────────────────────

function TextField({ label, hint, value, placeholder, onChange, type }: {
    label: string; hint?: string; value: string;
    placeholder?: string; onChange: (v: string) => void; type?: string;
}) {
    return (
        <div style={S.rowStacked}>
            <span style={S.label}>{label}</span>
            {hint && <span style={S.hint}>{hint}</span>}
            <TextInput value={value} placeholder={placeholder} onChange={onChange} type={type} style={{ marginTop: 8 }} />
        </div>
    );
}

function SwitchField({ label, hint, value, onChange }: {
    label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <div style={S.row}>
            <div style={S.rowLeft}>
                <span style={S.label}>{label}</span>
                {hint && <span style={S.hint}>{hint}</span>}
            </div>
            <FormSwitch title="" value={value} onChange={onChange} hideBorder />
        </div>
    );
}

function SelectField({ label, hint, options, value, onChange }: {
    label: string; hint?: string;
    options: { label: string; value: string; }[];
    value: string; onChange: (v: string) => void;
}) {
    return (
        <div style={S.row}>
            <div style={S.rowLeft}>
                <span style={S.label}>{label}</span>
                {hint && <span style={S.hint}>{hint}</span>}
            </div>
            <Select
                // style={S.select}
                options={options}
                select={selected => onChange(selected as string)}
                isSelected={opt => opt === value}
                serialize={String}
                closeOnSelect={true}
            />
        </div>
    );
}
// ─── KeywordsInput ────────────────────────────────────────────────────────────

function KeywordsInput({ label, hint, value, onChange, placeholder }: {
    label: string; hint?: string; value: string[];
    onChange: (v: string[]) => void; placeholder?: string;
}) {
    const [raw, setRaw] = React.useState(() => arrToStr(value));
    const prevRef = React.useRef(value);

    React.useEffect(() => {
        if (prevRef.current !== value) { prevRef.current = value; setRaw(arrToStr(value)); }
    }, [value]);

    const commit = () => {
        const arr = strToArr(raw);
        prevRef.current = arr;
        onChange(arr);
        setRaw(arrToStr(arr));
    };

    return (
        <div style={S.rowStacked}>
            <span style={S.label}>{label}</span>
            {hint && <span style={S.hint}>{hint}</span>}
            <TextInput
                value={raw}
                placeholder={placeholder ?? "keyword1, keyword2, keyword3"}
                onChange={setRaw}
                onBlur={commit}
                style={{ marginTop: 8 }}
            />
        </div>
    );
}

// ─── IdChipInput ──────────────────────────────────────────────────────────────

type ChipKind = "user" | "channel" | "guild";
interface ResolvedUser { kind: "user"; id: string; name: string; discriminator?: string; avatarUrl?: string; }
interface ResolvedChannel { kind: "channel"; id: string; name: string; guildName?: string; guildIcon?: string; }
interface ResolvedGuild { kind: "guild"; id: string; name: string; iconUrl?: string; }
type ResolvedEntry = ResolvedUser | ResolvedChannel | ResolvedGuild;

function resolveId(id: string, kind: ChipKind): ResolvedEntry | null {
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

type ResolveState =
    | { status: "idle"; }
    | { status: "resolved"; entry: ResolvedEntry; }
    | { status: "error"; message: string; };

const chip = {
    list: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 8 },
    chip: { display: "flex", alignItems: "center", gap: 6, padding: "3px 8px 3px 6px", borderRadius: 999, background: "var(--background-mod-strong)", fontSize: 13 },
    avatar: { width: 20, height: 20, borderRadius: "50%", objectFit: "cover" as const, flexShrink: 0 },
    initial: { width: 20, height: 20, borderRadius: "50%", background: "var(--brand-500)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    remove: { background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 0 0 4px", fontSize: 16, lineHeight: 1 },
};

function EntryChip({ entry, onRemove }: { entry: ResolvedEntry; onRemove: () => void; }) {
    const avatarUrl = entry.kind === "user"
        ? (entry as ResolvedUser).avatarUrl
        : entry.kind === "guild"
            ? (entry as ResolvedGuild).iconUrl
            : (entry as ResolvedChannel).guildIcon;

    const initial = (entry.kind === "guild"
        ? entry.name
        : entry.kind === "user"
            ? entry.name
            : ((entry as ResolvedChannel).guildName ?? entry.name)
            || "?").charAt(0).toUpperCase();

    const label = entry.kind === "user"
        ? ((entry as ResolvedUser).discriminator ? `${entry.name}#${(entry as ResolvedUser).discriminator}` : entry.name)
        : entry.kind === "guild"
            ? entry.name
            : `#${entry.name}`;

    const sub = entry.kind === "channel" && (entry as ResolvedChannel).guildName
        ? (entry as ResolvedChannel).guildName!
        : entry.id;

    return (
        <div style={chip.chip}>
            {avatarUrl
                ? <img src={avatarUrl} alt="" style={chip.avatar} />
                : <div style={chip.initial}>{initial}</div>
            }
            <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: "var(--text-default)", lineHeight: 1.2 }}>{label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{sub}</span>
            </div>
            <button style={chip.remove} onClick={onRemove}>×</button>
        </div>
    );
}

function IdChipInput({ kind, label, hint, ids, onChange }: {
    kind: ChipKind; label: string; hint?: string;
    ids: string[]; onChange: (ids: string[]) => void;
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
                    ? "Guild not found in local cache. You need to be in this server."
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
        <div style={S.rowStacked}>
            <span style={S.label}>{label}</span>
            {hint && <span style={S.hint}>{hint}</span>}

            {ids.length > 0 && (
                <div style={chip.list}>
                    {ids.map(id => {
                        const entry = resolveId(id, kind) ?? { kind, id, name: id } as ResolvedEntry;
                        return <EntryChip key={id} entry={entry} onRemove={() => onChange(ids.filter(i => i !== id))} />;
                    })}
                </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        value={inputVal}
                        placeholder={
                            kind === "user" ? "User ID (e.g. 188851299255713792)"
                                : kind === "guild" ? "Guild ID (e.g. 123456789012345678)"
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
                <div style={{ marginTop: 6 }}>
                    <EntryChip entry={state.entry} onRemove={() => { setInputVal(""); setState({ status: "idle" }); }} />
                </div>
            )}
            {state.status === "error" && (
                <p style={{ ...S.noteDanger, marginTop: 6 }}>⚠ {state.message}</p>
            )}
        </div>
    );
}

function RoleChipInput({ roles, onChange }: {
    roles: { id: string; label: string; }[];
    onChange: (roles: { id: string; label: string; }[]) => void;
}) {
    const [newId, setNewId] = useState("");
    const [newLabel, setNewLabel] = useState("");

    const add = () => {
        const id = newId.trim();
        const label = newLabel.trim();
        if (!id || roles.some(r => r.id === id)) return;
        onChange([...roles, { id, label }]);
        setNewId("");
        setNewLabel("");
    };

    return (
        <div style={S.rowStacked}>
            <span style={S.label}>Mention roles</span>
            {/* <span style={S.hint}>Match if the message pings any of these roles. Description is optional just to keep track of what you've added.</span> */}

            {roles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                    {roles.map(r => (
                        <div key={r.id} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: 6,
                            background: "var(--background-mod-strong)",
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: "var(--brand-500)",
                                color: "#fff", fontSize: 13, fontWeight: 700,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                            }}>@</div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: "var(--text-default)", fontWeight: 500 }}>
                                    {r.label || r.id}
                                </div>
                                {r.label && (
                                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-code)" }}>
                                        {r.id}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => onChange(roles.filter(x => x.id !== r.id))}
                                style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    color: "var(--text-muted)", fontSize: 18, padding: 0,
                                    lineHeight: 1, flexShrink: 0,
                                }}
                            >×</button>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <div style={{ width: 160, flexShrink: 0 }}>
                    <TextInput
                        value={newId}
                        placeholder="Role ID"
                        onChange={setNewId}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && add()}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <TextInput
                        value={newLabel}
                        placeholder="Description (optional)"
                        onChange={setNewLabel}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && add()}
                    />
                </div>
                <Button
                    size="small"
                    variant="primary"
                    disabled={!newId.trim() || roles.some(r => r.id === newId.trim())}
                    onClick={add}
                >
                    Add
                </Button>
            </div>
        </div>
    );
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab({ draft, patch }: { draft: Omit<Trigger, "id">; patch: (p: Partial<Omit<Trigger, "id">>) => void; }) {
    const { name, description, iconUrl, type, state } = draft;
    const [iconAllowed, setIconAllowed] = useState<boolean | null>(null);

    // those domains will generally work
    const ALWAYS_ALLOWED_DOMAINS = [
        "github.io", // *.github.io (raw pages)
        "githubusercontent.com", // raw.githubusercontent.com
        "cdn.discordapp.com",
    ];

    useEffect(() => {
        if (!iconUrl) return void setIconAllowed(null);
        try {
            const { origin, hostname } = new URL(iconUrl);
            const hardcoded = ALWAYS_ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
            if (hardcoded) return void setIconAllowed(true);
            VencordNative.csp.isDomainAllowed(origin, ["img-src"]).then(setIconAllowed);
        } catch {
            setIconAllowed(null);
        }
    }, [iconUrl]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            <p style={S.sectionTitle}>Behavior</p>

            <SwitchField label="Enabled" hint="Whether this trigger is active." value={state.enabled} onChange={v => patch({ state: { ...state, enabled: v } })} />
            <SwitchField label="Automatic Join" hint="Automatically join the match when triggered." value={state.autojoin} onChange={v => patch({ state: { ...state, autojoin: v } })} />
            <SwitchField label="Notification" hint="Show a notification when matched." value={state.notify} onChange={v => patch({ state: { ...state, notify: v } })} />

            <p style={S.sectionTitle}>Details</p>

            <SelectField
                label="Trigger Type *"
                hint="What kind of trigger is this?"
                options={TRIGGER_TYPE_OPTIONS}
                value={type}
                onChange={v => patch({
                    type: v as TriggerType,
                    biome: needsBiomeTab(v as TriggerType)
                        ? (draft.biome ?? { ...DEFAULT_BIOME })
                        : undefined,
                })}
            />
            <TextField label="Trigger Name *" value={name} placeholder="e.g. Glitch" onChange={v => patch({ name: v })} />
            <TextField label="Trigger Description" value={description} placeholder="Optional" onChange={v => patch({ description: v })} />
            <TextField
                label="Trigger Icon URL"
                value={iconUrl}
                hint={iconAllowed === false
                    ? "⚠️ Optional. Must link directly to an image.\n"
                    : "Optional. Must link directly to an image."
                }
                placeholder="https://i.imgur.com/example.png"
                onChange={v => patch({ iconUrl: v })}
            />
            {iconAllowed === false &&
                <p style={{ ...S.noteDanger, fontSize: 14 }}>
                    Your current image link will probably not load due to Discord's Content Security Policy (CSP).
                    To avoid this, use an image from <strong>cdn.discordapp.com</strong>, <strong>i.imgur.com</strong> or <strong>githubusercontent.com</strong> instead.<br />
                    <strong>Note: this has no impact on the functionality of the trigger!</strong>
                </p>
            }
            {iconAllowed === true &&
                <p style={{ ...S.noteSuccess, fontSize: 14 }}>✅ Your image will most likely load.</p>
            }

            <p style={S.sectionTitle}>Join Lock</p>

            <p style={S.sectionDescription}>This section sets the join lock for this trigger, preventing higher or equal priority triggers from auto-joining for a set duration. This is useful for avoiding re-joins due to repeated messages, which can send you to the server's queue.</p>

            <SwitchField
                label="Join lock"
                hint="Prevent auto-joins from triggers of priority equal to or higher than this'."
                value={state.joinlock}
                onChange={v => patch({ state: { ...state, joinlock: v } })}
            />
            {state.joinlock && (
                <>
                    <TextField
                        label="Join Priority"
                        hint="Lower number means higher priority. Defaults to 10."
                        value={String(state.priority)}
                        placeholder="e.g. 10"
                        type="number"
                        onChange={v => patch({ state: { ...state, priority: Number(v) } })}
                    />
                    <TextField
                        label="Join Lock duration (seconds)"
                        value={String(state.joinlockDuration)}
                        hint="How long to prevent joins after matching this trigger."
                        type="number"
                        onChange={v => patch({ state: { ...state, joinlockDuration: Number(v) } })}
                    />
                </>
            )}

        </div>
    );
}

// ─── Tab: Conditions ──────────────────────────────────────────────────────────

function ConditionsTab({ conditions, onChange }: { conditions: TriggerConditions; onChange: (c: TriggerConditions) => void; }) {
    const { keywords } = conditions;
    const [newId, setNewId] = React.useState("");
    const [newLabel, setNewLabel] = React.useState("");

    const patchMatch = (p: Partial<typeof keywords.match>) => onChange({ ...conditions, keywords: { ...keywords, match: { ...keywords.match, ...p } } });
    const patchExclude = (p: Partial<typeof keywords.exclude>) => onChange({ ...conditions, keywords: { ...keywords, exclude: { ...keywords.exclude, ...p } } });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            <p style={S.sectionTitle}>Match Keywords</p>
            <p style={S.sectionDescription}>Message must contain at least one of these. Separate with commas.</p>
            <KeywordsInput label="Keywords" value={keywords.match.value} onChange={v => patchMatch({ value: v })} placeholder="cyber, cyberspace, cyber space" />
            <SwitchField label="Strict match" hint="Must match exact word boundary, not just a substring." value={keywords.match.strict} onChange={v => patchMatch({ strict: v })} />

            <p style={S.sectionTitle}>Exclude Keywords</p>
            <p style={S.sectionDescription}>Message must <strong>NOT</strong> contain any of these. Separate with commas.</p>
            <KeywordsInput label="Keywords" value={keywords.exclude.value} onChange={v => patchExclude({ value: v })} placeholder="hunt, help" />
            <SwitchField label="Strict match" hint="Must match exact word boundary, not just a substring." value={keywords.exclude.strict} onChange={v => patchExclude({ strict: v })} />

            <p style={S.sectionTitle}>Mention Roles</p>
            <p style={S.sectionDescription}>Match if the message pings any of these roles. Leave empty to skip this check.<br />
                <strong>If both keywords and roles are configured, either one is enough to match.</strong></p>
            <RoleChipInput roles={conditions.mentionRoles} onChange={roles => onChange({ ...conditions, mentionRoles: roles })} />

        </div>
    );
}

// ─── Tab: Biome ───────────────────────────────────────────────────────────────

function BiomeTab({ biome, onChange }: { biome: TriggerBiome; onChange: (b: TriggerBiome) => void; }) {
    const { detectorEnabled, detectorAccounts } = settings.use([
        "detectorEnabled", "detectorAccounts",
    ]);

    const hasAccounts = !!detectorAccounts;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            {(!detectorEnabled || !hasAccounts) && (
                <p style={S.noteDanger}>
                    You either have biome detection disabled in the plugin's settings, or you have no accounts configured.<br />
                    Biome detection will not work.
                </p>
            )}

            <p style={S.sectionTitle}>Detection</p>

            <SwitchField
                label="Enable biome detection"
                hint="Verify the biome after joining by reading Roblox log files."
                value={biome.detectionEnabled}
                onChange={v => onChange({ ...biome, detectionEnabled: v })}
            />

            {biome.detectionEnabled ? (
                <>
                    <TextField
                        label="RPC Keyword"
                        hint='Matches the BloxstrapRPC "hoverText" field in the Roblox log. Case-insensitive.'
                        value={biome.detectionKeyword}
                        placeholder="e.g. GLITCHED"
                        onChange={v => onChange({ ...biome, detectionKeyword: v })}
                    />

                    <p style={S.sectionTitle}>Behavior</p>

                    <SwitchField
                        label="Skip redundant join"
                        hint="If already in the detected biome, skip the join. Will still notify."
                        value={biome.skipRedundantJoin}
                        onChange={v => onChange({ ...biome, skipRedundantJoin: v })}
                    />
                </>
            ) : (
                <p style={S.note}>Enable biome detection above to configure the keyword and behavior options.</p>
            )}

        </div>
    );
}

// ─── Tab: Advanced ────────────────────────────────────────────────────────────

function AdvancedTab({ draft, patch }: { draft: Omit<Trigger, "id">; patch: (p: Partial<Omit<Trigger, "id">>) => void; }) {
    const { conditions } = draft;
    const { bypassMonitoredOnly, bypassIgnoredChannels, bypassIgnoredGuilds, bypassMatchAmbiguity, bypassLinkVerification, fromUser, ignoredChannels, ignoredGuilds, inChannel } = conditions;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            <p style={S.sectionTitle}>Bypasses</p>
            <p style={{ ...S.noteDanger, fontSize: 14 }}>These options disable safety checks. Only change them if you know what you're doing.</p>

            <SwitchField
                label="Bypass monitored channels"
                hint="Ignore the monitored channels setting. This trigger matches in any channel."
                value={bypassMonitoredOnly}
                onChange={v => patch({ conditions: { ...conditions, bypassMonitoredOnly: v } })}
            />
            <SwitchField
                label="Bypass ignored channels"
                hint="Ignore the ignored channels setting. This trigger matches even in ignored channels."
                value={bypassIgnoredChannels}
                onChange={v => patch({ conditions: { ...conditions, bypassIgnoredChannels: v } })}
            />
            <SwitchField
                label="Bypass ignored guilds"
                hint="Ignore the ignored guilds setting. This trigger matches even in ignored guilds."
                value={bypassIgnoredGuilds}
                onChange={v => patch({ conditions: { ...conditions, bypassIgnoredGuilds: v } })}
            />
            <SwitchField
                label="Bypass match ambiguity"
                hint="Always treat this trigger as unambiguous, even if multiple triggers match."
                value={bypassMatchAmbiguity}
                onChange={v => patch({ conditions: { ...conditions, bypassMatchAmbiguity: v } })}
            />
            <SwitchField
                label="Bypass link verification"
                hint="Skip Place ID verification for this trigger."
                value={bypassLinkVerification}
                onChange={v => patch({ conditions: { ...conditions, bypassLinkVerification: v } })}
            />

            <p style={S.sectionTitle}>User Filter</p>
            <IdChipInput
                kind="user"
                label="Allowed Users"
                hint="Only match messages from these users. Leave empty to match any user."
                ids={fromUser}
                onChange={ids => patch({ conditions: { ...conditions, fromUser: ids } })}
            />

            <p style={S.sectionTitle}>Channel Filter</p>
            <IdChipInput
                kind="channel"
                label="Allowed Channels"
                hint="In addition to monitored channels, only match this trigger in these channels. Leave empty for any channel."
                ids={inChannel}
                onChange={ids => patch({ conditions: { ...conditions, inChannel: ids } })}
            />
            <IdChipInput
                kind="channel"
                label="Ignored Channels"
                hint="Never match this trigger in these channels, even if other conditions pass."
                ids={ignoredChannels}
                onChange={ids => patch({ conditions: { ...conditions, ignoredChannels: ids } })}
            />

            <p style={S.sectionTitle}>Guild Filter</p>
            <IdChipInput
                kind="guild"
                label="Ignored Guilds"
                hint="Never match this trigger in these guilds, even if other conditions pass. Useful for guilds with no-sniper policies."
                ids={ignoredGuilds}
                onChange={ids => patch({ conditions: { ...conditions, ignoredGuilds: ids } })}
            />

        </div>
    );
}

// ─── Tab: Forwarding ─────────────────────────────────────────────────────────

function ForwardingTab({ forwarding, onChange, showBiome }: {
    forwarding: TriggerForwarding;
    onChange: (f: TriggerForwarding) => void;
    showBiome: boolean;
}) {
    const { globalWebhookUrl } = settings.use([
        "globalWebhookUrl",
    ]);

    const globalWebhook = globalWebhookUrl || "";

    const patch = (p: Partial<TriggerForwarding>) => onChange({ ...forwarding, ...p });
    const hasEffectiveWebhook = forwarding.webhookUrl.trim() || globalWebhook.trim();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ ...S.noteWarning, fontSize: 14 }}>
                ⚠️ This section is intended for advanced users only. Forwarding is <strong>not required</strong> for
                normal use — most users should leave this unconfigured. Sending webhooks on every match can trigger
                Discord's rate limits and get your webhook permanently disabled. Only set this up if you know exactly
                what you are doing.
            </p>

            {/* ── Webhook ── */}
            <p style={S.sectionTitle}>Webhook</p>
            <p style={S.sectionDescription}>
                Where to send forwarded messages. Leave blank to use the global webhook configured in the plugin settings.
            </p>

            <TextField
                label="Webhook URL"
                hint={
                    globalWebhook
                        ? `Leave empty to use global webhook: ${globalWebhook.slice(0, 48)}…`
                        : "No global webhook configured. Set one in plugin settings, or provide one here."
                }
                value={forwarding.webhookUrl}
                placeholder="https://discord.com/api/webhooks/…"
                onChange={v => patch({ webhookUrl: v })}
            />

            {!hasEffectiveWebhook && (
                <p style={S.noteWarning}>
                    No webhook is configured. Forwarding will do nothing even when enabled. Set a webhook here or in plugin settings.
                </p>
            )}

            {/* ── On Match ── */}
            <p style={S.sectionTitle}>On Match</p>

            <SwitchField
                label="Enabled"
                hint="Fires when the trigger matches"
                value={forwarding.onMatch.enabled}
                onChange={v => patch({ onMatch: { ...forwarding.onMatch, enabled: v } })}
            />

            {forwarding.onMatch.enabled && (
                <SwitchField
                    label="Early forward"
                    hint="Forward as early as possible. Can slightly impact join speed."
                    value={forwarding.onMatch.early}
                    onChange={v => patch({ onMatch: { ...forwarding.onMatch, early: v } })}
                />
            )}

            {/* ── On Detection (biome types only) ── */}
            {showBiome && <>
                <p style={S.sectionTitle}>On Detection</p>

                <SwitchField
                    label="Enabled"
                    hint="Fires when your detection confirms the biome is real."
                    value={forwarding.onDetection.enabled}
                    onChange={v => patch({ onDetection: { enabled: v } })}
                />
                <p style={S.note}>
                    For this to work, you obviously need to have biome detection set up in settings, and you need to join the biome to actually do the detection. It is impossible to verify if a biome is real or not without joining it.
                </p>
            </>}

            {!showBiome && (
                <p style={S.note}>
                    On-detection forwarding is only available for trigger types that support biome detection
                    (Rare Biome, Event Biome, Biome, Weather, Custom).
                </p>
            )}

        </div>
    );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const tabBarStyles = {
    bar: {
        display: "flex",
        gap: 2,
        borderBottom: "2px solid var(--background-modifier-accent)",
        padding: "0 16px",
        flexShrink: 0,
    } as React.CSSProperties,
    btn: (active: boolean): React.CSSProperties => ({
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--brand-500)" : "2px solid transparent",
        marginBottom: -2,
        padding: "8px 14px",
        color: active ? "var(--text-default)" : "var(--text-muted)",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        fontSize: 14,
    }),
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface TriggerModalProps { modalProps: ModalProps; trigger?: Trigger; }

function TriggerModal({ modalProps, trigger }: TriggerModalProps) {
    const isEditing = trigger !== undefined;
    const [innerTab, setInnerTab] = useState<InnerTab>("general");
    const [draft, setDraft] = useState<Omit<Trigger, "id">>(
        trigger ? (({ id, ...rest }) => rest)(trigger) : makeDefaultTrigger("BIOME")
    );

    const patch = (p: Partial<Omit<Trigger, "id">>) => setDraft(prev => ({ ...prev, ...p }));
    const isValid = draft.name.trim().length > 0;

    const showBiome = needsBiomeTab(draft.type);
    const tabs: { id: InnerTab; label: string; }[] = [
        { id: "general", label: "General" },
        { id: "conditions", label: "Conditions" },
        ...(showBiome ? [{ id: "biome" as InnerTab, label: "Biome" }] : []),
        { id: "forwarding", label: "Forwarding" },
        { id: "advanced", label: "Advanced" },
    ];
    if (innerTab === "biome" && !showBiome) setInnerTab("general");

    const handleSave = async () => {
        if (!isValid) return;
        if (isEditing) await updateTrigger(trigger.id, draft);
        else await addTrigger(draft);
        showToast(isEditing ? `Trigger "${draft.name}" updated!` : "Trigger added!", Toasts.Type.SUCCESS);
        modalProps.onClose();
    };

    const handleDelete = async () => {
        if (!isEditing) return;
        await deleteTrigger(trigger.id);
        showToast("Trigger deleted.", Toasts.Type.MESSAGE);
        modalProps.onClose();
    };

    const handleCopy = () => {
        const { id, ...rest } = trigger!;
        navigator.clipboard.writeText(JSON.stringify([rest], null, 2));
        showToast("Trigger copied to clipboard!", Toasts.Type.SUCCESS);
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>

            <ModalHeader>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Heading tag="h5">{isEditing ? `Edit — ${trigger.name}` : "Add Trigger"}</Heading>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <div style={tabBarStyles.bar}>
                {tabs.map(t => (
                    <button key={t.id} style={tabBarStyles.btn(innerTab === t.id)} onClick={() => setInnerTab(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            <ModalContent separator>
                {innerTab === "general" && <GeneralTab draft={draft} patch={patch} />}
                {innerTab === "conditions" && <ConditionsTab conditions={draft.conditions} onChange={c => patch({ conditions: c })} />}
                {innerTab === "biome" && draft.biome && <BiomeTab biome={draft.biome} onChange={b => patch({ biome: b })} />}
                {innerTab === "advanced" && <AdvancedTab draft={draft} patch={patch} />}
                {innerTab === "forwarding" && <ForwardingTab forwarding={draft.forwarding} onChange={f => patch({ forwarding: f })} showBiome={showBiome} />}
            </ModalContent>

            <ModalFooter separator>
                <Button variant="positive" disabled={!isValid} onClick={handleSave} style={{ marginLeft: "8px" }}>
                    {isEditing ? "Save" : "Add"}
                </Button>
                {isEditing && (
                    <>
                        <Button variant="dangerPrimary" onClick={handleDelete} style={{ marginLeft: "8px" }}>
                            Delete
                        </Button>
                        <Button variant="link" onClick={handleCopy} style={{ marginLeft: "8px" }}>
                            Copy
                        </Button>
                    </>
                )}
            </ModalFooter>

        </ModalRoot>
    );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const openAddTriggerModal = () => openModal(p => <TriggerModal modalProps={p} />);
export const openEditTriggerModal = (t: Trigger) => openModal(p => <TriggerModal modalProps={p} trigger={t} />);
