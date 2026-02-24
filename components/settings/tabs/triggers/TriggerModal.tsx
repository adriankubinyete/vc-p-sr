/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { findByPropsLazy } from "@webpack";
import { React, Select, showToast, TextInput, Toasts, useState } from "@webpack/common";

import {
    addTrigger,
    DEFAULT_BIOME,
    deleteTrigger,
    makeDefaultTrigger,
    Trigger,
    TriggerBiome,
    TriggerConditions,
    TriggerType,
    updateTrigger,
} from "../../../../stores/TriggerStore";

// ─── Discord stores (lazy) ────────────────────────────────────────────────────

const UserStore = findByPropsLazy("getUser", "getCurrentUser");
const ChannelStore = findByPropsLazy("getChannel", "getDMFromUserId");
const GuildStore = findByPropsLazy("getGuild", "getGuildCount");

// ─── Helpers ──────────────────────────────────────────────────────────────────

type InnerTab = "general" | "conditions" | "biome";

const TRIGGER_TYPE_OPTIONS = [
    { label: "Rare Biome", value: "RARE_BIOME" },
    { label: "Event Biome", value: "EVENT_BIOME" },
    { label: "Biome", value: "BIOME" },
    { label: "Weather", value: "WEATHER" },
    { label: "Merchant", value: "MERCHANT" },
    { label: "Custom", value: "CUSTOM" },
];

const needsBiomeTab = (type: TriggerType) => type === "RARE_BIOME" || type === "EVENT_BIOME" || type === "BIOME" || type === "WEATHER" || type === "CUSTOM";
const arrToStr = (arr: string[]) => arr.join(", ");
const strToArr = (str: string): string[] => str.split(",").map(s => s.trim()).filter(Boolean);

// ─── KeywordsInput ─────────────────────────────────────────────────────────────

interface KeywordsInputProps {
    label: string;
    description?: string;
    value: string[];
    onChange: (v: string[]) => void;
    placeholder?: string;
}

function KeywordsInput({ label, description, value, onChange, placeholder }: KeywordsInputProps) {
    const [raw, setRaw] = React.useState(() => arrToStr(value));
    const prevRef = React.useRef(value);

    React.useEffect(() => {
        if (prevRef.current !== value) {
            prevRef.current = value;
            setRaw(arrToStr(value));
        }
    }, [value]);

    const commit = () => {
        const arr = strToArr(raw);
        prevRef.current = arr;
        onChange(arr);
        setRaw(arrToStr(arr));
    };

    return (
        <section>
            <Heading tag="h5">{label}</Heading>
            <TextInput
                value={raw}
                placeholder={placeholder ?? "keyword1, keyword2, keyword3"}
                onChange={setRaw}
                onBlur={commit}
            />
            {description && <Paragraph style={{ marginTop: 4 }}>{description}</Paragraph>}
        </section>
    );
}

// ─── IdChipInput ──────────────────────────────────────────────────────────────

type ChipKind = "user" | "channel";

interface ResolvedUser { kind: "user"; id: string; name: string; discriminator?: string; avatarUrl?: string; }
interface ResolvedChannel { kind: "channel"; id: string; name: string; guildName?: string; guildIcon?: string; }
type ResolvedEntry = ResolvedUser | ResolvedChannel;

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

const chipStyles = {
    list: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 8 },
    chip: { display: "flex", alignItems: "center", gap: 6, padding: "3px 8px 3px 6px", borderRadius: 999, background: "var(--background-modifier-accent)", fontSize: 13 },
    avatar: { width: 20, height: 20, borderRadius: "50%", objectFit: "cover" as const, flexShrink: 0 },
    initial: { width: 20, height: 20, borderRadius: "50%", background: "var(--brand-500)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    label: { color: "var(--text-normal)", lineHeight: 1.2 },
    sub: { color: "var(--text-muted)", fontSize: 11 },
    remove: { background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 0 0 2px", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center" },
    row: { display: "flex", gap: 8, marginTop: 4, alignItems: "center" },
};

function EntryChip({ entry, onRemove }: { entry: ResolvedEntry; onRemove: () => void; }) {
    const avatarUrl = entry.kind === "user"
        ? (entry as ResolvedUser).avatarUrl
        : (entry as ResolvedChannel).guildIcon;
    const initial = (entry.kind === "user"
        ? entry.name
        : ((entry as ResolvedChannel).guildName ?? entry.name)
    ).charAt(0).toUpperCase();
    const label = entry.kind === "user"
        ? ((entry as ResolvedUser).discriminator ? `${entry.name}#${(entry as ResolvedUser).discriminator}` : entry.name)
        : `#${entry.name}`;
    const sub = entry.kind === "channel" && (entry as ResolvedChannel).guildName
        ? (entry as ResolvedChannel).guildName!
        : entry.id;

    return (
        <div style={chipStyles.chip}>
            {avatarUrl
                ? <img src={avatarUrl} alt="" style={chipStyles.avatar} />
                : <div style={chipStyles.initial}>{initial}</div>
            }
            <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={chipStyles.label}>{label}</span>
                <span style={chipStyles.sub}>{sub}</span>
            </div>
            <button style={chipStyles.remove} onClick={onRemove}>×</button>
        </div>
    );
}

interface IdChipInputProps {
    kind: ChipKind;
    label: string;
    description?: string;
    ids: string[];
    onChange: (ids: string[]) => void;
}

function IdChipInput({ kind, label, description, ids, onChange }: IdChipInputProps) {
    const [inputVal, setInputVal] = useState("");
    const [state, setState] = useState<ResolveState>({ status: "idle" });

    const isSnowflake = (v: string) => /^\d{17,20}$/.test(v.trim());

    const handleChange = (val: string) => {
        setInputVal(val);
        setState({ status: "idle" });
        const trimmed = val.trim();
        if (!isSnowflake(trimmed)) return;
        if (ids.includes(trimmed)) { setState({ status: "error", message: "Already added." }); return; }
        const entry = resolveId(trimmed, kind);
        setState(entry
            ? { status: "resolved", entry }
            : {
                status: "error",
                message: kind === "user"
                    ? "User not found in local cache. They need to be visible in your current session."
                    : "Channel not found in local cache. Open the channel first so Discord loads it.",
            }
        );
    };

    const handleAdd = () => {
        if (state.status !== "resolved") return;
        onChange([...ids, state.entry.id]);
        setInputVal("");
        setState({ status: "idle" });
    };

    return (
        <section>
            <Heading tag="h5">{label}</Heading>

            {ids.length > 0 && (
                <div style={chipStyles.list}>
                    {ids.map(id => {
                        const entry = resolveId(id, kind) ?? { kind, id, name: id } as ResolvedEntry;
                        return <EntryChip key={id} entry={entry} onRemove={() => onChange(ids.filter(i => i !== id))} />;
                    })}
                </div>
            )}

            {/* FIX 3: TextInput dentro de div flex:1 — o componente nativo não propaga style */}
            <div style={chipStyles.row}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        value={inputVal}
                        placeholder={kind === "user" ? "User ID (e.g. 188851299255713792)" : "Channel ID (e.g. 123456789012345678)"}
                        onChange={handleChange}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleAdd()}
                    />
                </div>
                <Button
                    size="small"
                    variant="primary"
                    disabled={state.status !== "resolved"}
                    onClick={handleAdd}
                >
                    Add
                </Button>
            </div>

            {state.status === "resolved" && (
                <div style={{ marginTop: 6 }}>
                    <EntryChip
                        entry={state.entry}
                        onRemove={() => { setInputVal(""); setState({ status: "idle" }); }}
                    />
                </div>
            )}
            {state.status === "error" && (
                <Paragraph style={{ color: "var(--text-danger)", marginTop: 4 }}>
                    ⚠ {state.message}
                </Paragraph>
            )}
            {description && <Paragraph style={{ marginTop: 4 }}>{description}</Paragraph>}
        </section>
    );
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab({ draft, patch }: { draft: Omit<Trigger, "id">; patch: (p: Partial<Omit<Trigger, "id">>) => void; }) {
    const { name, description, icon_url, type, state } = draft;

    return (
        <>
            <Heading style={{ marginBottom: 8 }} tag="h4">Details</Heading>

            <section>
                <Heading tag="h5">Type</Heading>
                <Select
                    options={TRIGGER_TYPE_OPTIONS}
                    select={v => patch({
                        type: v as TriggerType,
                        biome: needsBiomeTab(v as TriggerType)
                            ? (draft.biome ?? { ...DEFAULT_BIOME })
                            : undefined,
                    })}
                    isSelected={v => v === type}
                    serialize={v => v}
                />
            </section>

            <section>
                <Heading tag="h5">Name *</Heading>
                <TextInput value={name} placeholder="e.g. Glitch" onChange={v => patch({ name: v })} />
            </section>

            <section style={{ marginTop: 8 }}>
                <Heading tag="h5">Description</Heading>
                <TextInput value={description} placeholder="Optional" onChange={v => patch({ description: v })} />
            </section>

            <section style={{ marginTop: 8 }}>
                <Heading tag="h5">Icon URL</Heading>
                <TextInput value={icon_url} placeholder="https://..." onChange={v => patch({ icon_url: v })} />
            </section>

            <Divider style={{ margin: "12px 0" }} />
            <Heading style={{ marginBottom: 8 }} tag="h4">Behavior</Heading>

            <FormSwitch title="Enabled" value={state.enabled} onChange={v => patch({ state: { ...state, enabled: v } })} description="Whether this trigger is active." />
            <FormSwitch title="Auto-join" value={state.autojoin} onChange={v => patch({ state: { ...state, autojoin: v } })} description="Automatically join the match when triggered." />
            <FormSwitch title="Notify" value={state.notify} onChange={v => patch({ state: { ...state, notify: v } })} description="Show a notification when matched." />
            <section style={{ marginTop: 8 }}>
                <Heading tag="h5">Priority</Heading>
                <Paragraph style={{ marginBottom: 4 }}>
                    A low number means more important. Defaults to 10.
                </Paragraph>
                <TextInput value={String(state.priority)} placeholder="e.g. 10" onChange={v => patch({ state: { ...state, priority: Number(v) } })} />
            </section>
            <Divider style={{ margin: "12px 0" }} />
            <FormSwitch title="Join lock" value={state.joinlock} onChange={v => patch({ state: { ...state, joinlock: v } })} description="Should prevent other triggers from happening while this one is active? Triggers with a higher priority will bypass join locks." />

            {state.joinlock && (
                <section style={{ marginTop: 8 }}>
                    <Heading tag="h5">Join lock duration (seconds)</Heading>
                    <TextInput
                        type="number"
                        value={String(state.joinlock_duration)}
                        onChange={v => patch({ state: { ...state, joinlock_duration: Number(v) } })}
                    />
                </section>
            )}
    </>
    );
}

// ─── Tab: Conditions ──────────────────────────────────────────────────────────

function ConditionsTab({ conditions, onChange }: { conditions: TriggerConditions; onChange: (c: TriggerConditions) => void; }) {
    const { keywords, fromUser, inChannel } = conditions;

    const patchMatch = (p: Partial<typeof keywords.match>) => onChange({ ...conditions, keywords: { ...keywords, match: { ...keywords.match, ...p } } });
    const patchExclude = (p: Partial<typeof keywords.exclude>) => onChange({ ...conditions, keywords: { ...keywords, exclude: { ...keywords.exclude, ...p } } });

    return (
        <>
            <Heading tag="h5">Match keywords</Heading>
            <Paragraph style={{ marginBottom: 8 }}>
                Message must contain at least one of these. Separate with commas. Click away to confirm.
            </Paragraph>

            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <KeywordsInput
                    label="Keywords"
                    value={keywords.match.value}
                    onChange={v => patchMatch({ value: v })}
                    placeholder="cyber, cyberspace, cyber space"
                />

                <FormSwitch
                    title="Strict match"
                    value={keywords.match.strict}
                    onChange={v => patchMatch({ strict: v })}
                    description="Must match the exact word boundary, not just a substring."
                    hideBorder={true}
                />
            </section>

            <Divider style={{ margin: "12px 0" }} />

            <Heading tag="h5">Exclude keywords</Heading>
            <Paragraph style={{ marginBottom: 8 }}>
                Message must NOT contain any of these. Separate with commas. Click away to confirm.
            </Paragraph>


            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <KeywordsInput
                    label="Keywords"
                    value={keywords.exclude.value}
                    onChange={v => patchExclude({ value: v })}
                    placeholder="hunt, help"
                />

                <FormSwitch
                    title="Strict match"
                    value={keywords.exclude.strict}
                    onChange={v => patchExclude({ strict: v })}
                    description="Must match the exact word boundary, not just a substring."
                    hideBorder={true}
                />
            </section>

            <Divider style={{ margin: "12px 0" }} />

            <IdChipInput
                kind="user"
                label="Filter by user"
                description="Only match messages from these users. Leave empty to match any user."
                ids={fromUser}
                onChange={ids => onChange({ ...conditions, fromUser: ids })}
            />

            <Divider style={{ margin: "12px 0" }} />

            <IdChipInput
                kind="channel"
                label="Filter by channel"
                description="Only match messages in these channels. Leave empty to match any channel."
                ids={inChannel}
                onChange={ids => onChange({ ...conditions, inChannel: ids })}
            />
        </>
    );
}

// ─── Tab: Biome ───────────────────────────────────────────────────────────────

function BiomeTab({ biome, onChange }: { biome: TriggerBiome; onChange: (b: TriggerBiome) => void; }) {
    const biomeGloballyEnabled = true; // TODO: conectar à sua store de settings

    return (
        <>
            {!biomeGloballyEnabled && (
                <Paragraph style={{ color: "var(--text-danger)", marginBottom: 12 }}>
                    ⚠️ Biome detection is currently disabled in your settings or your detection user list is empty. These settings will have no effect.
                </Paragraph>
            )}

            <FormSwitch
                title="Enable biome detection"
                value={biome.detection_enabled}
                onChange={v => onChange({ ...biome, detection_enabled: v })}
            />

            {biome.detection_enabled && (
                <section style={{ marginTop: 8 }}>
                    <Heading tag="h5">RPC Keyword</Heading>
                    <TextInput
                        value={biome.detection_keyword}
                        placeholder="e.g. GLITCHED"
                        onChange={v => onChange({ ...biome, detection_keyword: v })}
                    />
                    <Paragraph style={{ marginTop: 4 }}>
                        Keyword used to detect a biome from Roblox's client debug log. Should match the BloxstrapRPC "hoverText" field. If empty, biome detection will be disabled.
                    </Paragraph>
                </section>
            )}
        </>
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
        color: active ? "var(--text-normal)" : "var(--text-muted)",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        fontSize: 14,
    }),
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface TriggerModalProps {
    modalProps: ModalProps;
    trigger?: Trigger;
}

function TriggerModal({ modalProps, trigger }: TriggerModalProps) {
    const isEditing = trigger !== undefined;
    const [innerTab, setInnerTab] = useState<InnerTab>("general");
    const [draft, setDraft] = useState<Omit<Trigger, "id">>(
        trigger ? (({ id, ...rest }) => rest)(trigger) : makeDefaultTrigger("CUSTOM")
    );

    const patch = (p: Partial<Omit<Trigger, "id">>) => setDraft(prev => ({ ...prev, ...p }));
    const isValid = draft.name.trim().length > 0;

    const showBiome = needsBiomeTab(draft.type);
    const tabs: { id: InnerTab; label: string; }[] = [
        { id: "general", label: "General" },
        { id: "conditions", label: "Conditions" },
        ...(showBiome ? [{ id: "biome" as InnerTab, label: "Biome" }] : []),
    ];
    if (innerTab === "biome" && !showBiome) setInnerTab("general");

    const handleSave = async () => {
        if (!isValid) return;
        if (isEditing) await updateTrigger(trigger.id, draft);
        else await addTrigger(draft);
        showToast(isEditing ? "Trigger updated!" : "Trigger added!", Toasts.Type.SUCCESS);
        modalProps.onClose();
    };

    const handleDelete = async () => {
        if (!isEditing) return;
        await deleteTrigger(trigger.id);
        showToast("Trigger deleted.", Toasts.Type.MESSAGE);
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>

            {/* Nunca scrolla */}
            <ModalHeader>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                }}>
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

            {/* Só o conteúdo scrolla */}
            <ModalContent separator>
                {innerTab === "general" && <GeneralTab draft={draft} patch={patch} />}
                {innerTab === "conditions" && <ConditionsTab conditions={draft.conditions} onChange={c => patch({ conditions: c })} />}
                {innerTab === "biome" && draft.biome && <BiomeTab biome={draft.biome} onChange={b => patch({ biome: b })} />}
            </ModalContent>

            {/* Nunca scrolla */}
            <ModalFooter separator>
                {isEditing && (
                    /* FIX 1: dangerPrimary = botão vermelho real */
                    <Button variant="dangerPrimary" onClick={handleDelete} style={{ marginLeft: "4px" }}>
                        Delete
                    </Button>
                )}
                <Button variant="primary" disabled={!isValid} onClick={handleSave} style={{ marginLeft: "4px" }}>
                    {isEditing ? "Save" : "Add"}
                </Button>
            </ModalFooter>

        </ModalRoot>
    );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const openAddTriggerModal = () => openModal(p => <TriggerModal modalProps={p} />);
export const openEditTriggerModal = (t: Trigger) => openModal(p => <TriggerModal modalProps={p} trigger={t} />);
