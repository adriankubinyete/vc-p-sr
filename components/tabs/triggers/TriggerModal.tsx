/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, Select, Slider, TextInput, Toasts, useEffect, useState } from "@webpack/common";

import { settings } from "../../../settings";
import {
    addTrigger,
    DEFAULT_BIOME,
    deleteTrigger,
    makeDefaultTrigger,
    safeExportDraft,
    Trigger,
    TriggerBiome,
    TriggerConditions,
    TriggerForwarding,
    TriggerType,
    updateTrigger,
} from "../../../stores/TriggerStore";
import { playAudio, showToast } from "../../../utils";
import { IdChipInput } from "../../ui/IdChipInput";
import { KeywordsInput } from "../../ui/KeywordsInput";
import { Note } from "../../ui/Note";
import { confirmWebhookThenRun } from "./exportActions";

const logger = new Logger("SolRadar.TriggerModal");

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

};

// ─── Primitive field components ───────────────────────────────────────────────

function TextField({ label, hint, value, placeholder, onChange, type, maxLength }: {
    label: string; hint?: string; value: string;
    placeholder?: string; onChange: (v: string) => void; type?: string; maxLength?: number;
}) {
    return (
        <div style={S.rowStacked}>
            <span style={S.label}>{label}</span>
            {hint && <span style={S.hint}>{hint}</span>}
            <TextInput value={value} placeholder={placeholder} onChange={onChange} maxLength={maxLength} />
        </div>
    );
}

function TextAreaField({ label, hint, value, placeholder, onChange, maxLength }: {
    label: string; hint?: string; value: string;
    placeholder?: string; onChange: (v: string) => void; maxLength?: number;
}) {
    return (
        <div style={S.rowStacked}>
            <span style={S.label}>{label}</span>
            {hint && <span style={S.hint}>{hint}</span>}
            <textarea
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                maxLength={maxLength}
                style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--background-mod-subtle)",
                    background: "var(--background-tertiary)",
                    color: "var(--text-default)",
                    fontSize: 13,
                    fontFamily: "var(--font-primary)",
                    lineHeight: 1.5,
                    minHeight: 80,
                    boxSizing: "border-box",
                    outline: "none",
                    scrollbarWidth: "thin",
                }}
            />
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
// ─── IdChipInput ──────────────────────────────────────────────────────────────

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

interface AudioFieldProps {
    label: string;
    hint?: string;
    value: string | undefined;
    volume: number | undefined;
    onChangeAudio: (dataUri: string | undefined) => void;
    onChangeVolume: (volume: number) => void;
}

export function AudioField({ label, hint, value, volume, onChangeAudio, onChangeVolume }: AudioFieldProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => onChangeAudio(ev.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = "";
    }

    return (
        <div style={S.rowStacked}>
            <span style={S.label}>{label}</span>
            {hint && <span style={S.hint}>{hint}</span>}

            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: "none" }}
                onChange={handleFileChange}
            />

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    marginTop: 8,
                    width: "100%",
                }}
            >
                <div style={{ display: "flex", gap: 8 }}>
                    {value && (
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => playAudio(value, volume)}
                        >
                            Preview 🔊
                        </Button>
                    )}

                    <Button
                        size="small"
                        variant="link"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {value ? "Replace" : "Choose File"}
                    </Button>
                </div>

                {value && (
                    <Button
                        size="small"
                        variant="dangerPrimary"
                        style={{ marginLeft: "auto" }}
                        onClick={() => onChangeAudio(undefined)}
                    >
                        Remove
                    </Button>
                )}
            </div>

            {value && (
                <>
                    <span style={{ ...S.hint, marginTop: 10 }}>Volume ({volume ?? 100}%)</span>
                    <Slider
                        minValue={0}
                        maxValue={100}
                        initialValue={volume ?? 100}
                        onValueChange={v => onChangeVolume(Math.round(v))}
                    />
                </>
            )}
        </div>
    );
}

// ─── Tab: General ──────────────────────────────────────────────────────────

function GeneralTab({ draft, patch }: { draft: Omit<Trigger, "id">; patch: (p: Partial<Omit<Trigger, "id">>) => void; }) {
    const { name, description, iconUrl, type, state } = draft;
    const [iconAllowed, setIconAllowed] = useState<boolean | null>(null);

    const ALWAYS_ALLOWED_DOMAINS = [
        "github.io",
        "githubusercontent.com",
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

    const patchState = (p: Partial<typeof state>) => patch({ state: { ...state, ...p } });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            {/* ── Identity ── */}
            <p style={S.sectionTitle}>Identity</p>

            <SelectField
                label="Type *"
                hint="Controls what kind of event this trigger watches for."
                options={TRIGGER_TYPE_OPTIONS}
                value={type}
                onChange={v => patch({
                    type: v as TriggerType,
                    biome: needsBiomeTab(v as TriggerType)
                        ? (draft.biome ?? { ...DEFAULT_BIOME })
                        : undefined,
                })}
            />
            <TextField
                label="Name *"
                value={name}
                placeholder="e.g. Glitch"
                onChange={v => patch({ name: v })}
            />
            <TextField
                label="Description"
                value={description}
                placeholder="Optional — just for your own reference"
                onChange={v => patch({ description: v })}
            />
            <TextField
                label="Icon URL"
                value={iconUrl}
                hint="Optional. Paste a direct link to an image (must end in .png, .jpg, etc.)."
                placeholder="https://i.imgur.com/example.png"
                onChange={v => patch({ iconUrl: v })}
            />
            {iconAllowed === false && (
                <Note variant="danger" style={{ fontSize: 14 }}>
                    This image probably won't load — Discord blocks external images that aren't on its allowlist.
                    Use an image from <strong>cdn.discordapp.com</strong>, <strong>imgur.com</strong> or <strong>githubusercontent.com</strong> instead.<br />
                    <strong>This doesn't affect how the trigger works, only the icon display.</strong>
                </Note>
            )}
            {iconAllowed === true && (
                <Note variant="positive" style={{ fontSize: 14 }}>✅ This image should load correctly.</Note>
            )}

            {/* ── Behavior ── */}
            <p style={S.sectionTitle}>Behavior</p>

            <SwitchField
                label="Enabled"
                hint="Turn this trigger on or off without deleting it."
                value={state.enabled}
                onChange={v => patchState({ enabled: v })}
            />
            <SwitchField
                label="Auto Join"
                hint="Automatically join the Roblox server when this trigger fires."
                value={state.autojoin}
                onChange={v => patchState({ autojoin: v })}
            />
            <SwitchField
                label="Notification"
                hint="Show a desktop notification when this trigger matches."
                value={state.notify}
                onChange={v => patchState({ notify: v })}
            />
            {state.notify && (
                <AudioField
                    label="Notification Sound"
                    hint="Optional. Play a custom sound when this trigger fires."
                    value={state.notificationSound}
                    volume={state.notificationSoundVolume}
                    onChangeAudio={v => patchState({ notificationSound: v })}
                    onChangeVolume={v => patchState({ notificationSoundVolume: v })}
                />
            )}

            {/* ── Join Lock ── */}
            <p style={S.sectionTitle}>Join Lock</p>
            <p style={S.sectionDescription}>
                After this trigger fires, join lock temporarily blocks other auto-joins of equal or higher priority.
                Useful when the same biome gets posted multiple times in a row — without this, you'd get sent to the queue repeatedly.
            </p>

            <SwitchField
                label="Enable join lock"
                hint="Block other auto-joins for a short time after this trigger fires."
                value={state.joinlock}
                onChange={v => patchState({ joinlock: v })}
            />
            {state.joinlock && (
                <>
                    <TextField
                        label="Priority"
                        hint="Triggers with a lower number have higher priority. The join lock only blocks triggers at this priority level or higher. Default is 10."
                        value={String(state.priority)}
                        placeholder="10"
                        type="number"
                        onChange={v => patchState({ priority: Number(v) })}
                    />
                    <TextField
                        label="Lock Duration (seconds)"
                        hint="How many seconds to block auto-joins after this trigger fires."
                        value={String(state.joinlockDuration)}
                        placeholder="e.g. 30"
                        type="number"
                        onChange={v => patchState({ joinlockDuration: Number(v) })}
                    />
                </>
            )}

        </div>
    );
}

// ─── Match Preview ────────────────────────────────────────────────────────────

function generatePreviewMessages(name: string): string[] {
    const n = name.trim() || "Trigger";
    const mid = Math.ceil(n.length / 2);
    const lastChar = n[n.length - 1];
    return [
        `${n}`,
        `${n.toUpperCase()}`,
        `${n} biome`,
        `${n} biome!!!!`,
        `omg ${n} spotted!`,
        `Hunting biome ${n}!`,
        `${n.slice(0, mid)} ${n.slice(mid)}`,
        `${n}${lastChar.repeat(5)}`,
        `${n}Biome`,
        `${n} hunt come help`
    ];
}

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function testKw(text: string, kw: string, strict: boolean) {
    const pat = strict ? `\\b${escapeRegex(kw)}\\b` : escapeRegex(kw);
    return new RegExp(pat, "i").test(text);
}

function highlightMatches(text: string, kws: string[], strict: boolean): React.ReactNode[] {
    const active = kws.filter(k => k.trim());
    if (!active.length) return [text];
    const pats = active.map(k => strict ? `\\b${escapeRegex(k)}\\b` : escapeRegex(k));
    const re = new RegExp(`(${pats.join("|")})`, "gi");
    return text.split(re).map((part, i) =>
        i % 2 === 1
            ? <mark key={i} style={{
                background: "hsl(140deg 50% 44% / 0.35)",
                color: "hsl(140deg 50% 68%)",
                borderRadius: 3, padding: "0 2px", fontWeight: 700,
            }}>{part}</mark>
            : part
    );
}

function MatchPreview({ triggerName, matchKeywords, matchStrict, excludeKeywords, excludeStrict }: {
    triggerName: string;
    matchKeywords: string[];
    matchStrict: boolean;
    excludeKeywords: string[];
    excludeStrict: boolean;
}) {
    const [open, setOpen] = useState(true);
    const hasAnyKeyword = matchKeywords.some(k => k.trim());
    const messages = generatePreviewMessages(triggerName);
    const displayName = triggerName.trim() || "UnnamedTrigger";

    return (
        <div style={{ borderRadius: 8, background: "var(--background-mod-subtle)", overflow: "hidden" }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", background: "none", border: "none",
                    padding: "10px 14px", cursor: "pointer", textAlign: "left",
                }}
            >
                <span style={{
                    color: "var(--text-muted)", fontSize: 10, lineHeight: 1,
                    display: "inline-block", transition: "transform 0.15s",
                    transform: open ? "rotate(90deg)" : "rotate(0deg)",
                }}>▶</span>
                <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: "var(--control-secondary-text-default)",
                }}>
                    Live Preview
                </span>
            </button>

            {open && (
                <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, margin: 0 }}>
                        Use these example messages to test how your trigger will work.{" "}
                        <strong style={{ color: "var(--text-default)" }}>
                            Try adding "{displayName}" as a keyword above and watch the matches light up.
                        </strong>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Note: These examples were generated based on your current trigger name of "{displayName}".</p>
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {messages.map(msg => {
                            const hasMatch = matchKeywords.some(kw => kw && testKw(msg, kw, matchStrict));
                            const isExcluded = excludeKeywords.some(kw => kw && testKw(msg, kw, excludeStrict));
                            const matched = hasMatch && !isExcluded;

                            return (
                                <div key={msg} style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "6px 10px", borderRadius: 6,
                                    background: matched
                                        ? "hsl(140deg 50% 44% / 0.1)"
                                        : isExcluded
                                            ? "hsl(0deg 65% 50% / 0.08)"
                                            : "var(--background-mod-normal)",
                                    border: `1px solid ${matched ? "hsl(140deg 50% 44% / 0.25)" : "transparent"}`,
                                    transition: "background 0.12s, border-color 0.12s",
                                }}>
                                    <span style={{
                                        fontSize: 13, fontWeight: 700, flexShrink: 0, lineHeight: 1,
                                        color: matched ? "hsl(140deg 50% 55%)" : isExcluded ? "hsl(0deg 65% 60%)" : "var(--text-muted)",
                                    }}>
                                        {matched ? "✓" : isExcluded ? "⊘" : "·"}
                                    </span>
                                    <span style={{
                                        fontSize: 12, fontFamily: "var(--font-code)", flex: 1,
                                        color: matched ? "var(--text-default)" : "var(--text-muted)",
                                    }}>
                                        {matched ? highlightMatches(msg, matchKeywords, matchStrict) : msg}
                                    </span>
                                    {isExcluded && (
                                        <span style={{ fontSize: 10, color: "hsl(0deg 65% 60%)", fontStyle: "italic", flexShrink: 0 }}>
                                            excluded
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {!hasAnyKeyword && (
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", fontStyle: "italic" }}>
                            Add keywords above to see matches here.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Tab: Conditions ──────────────────────────────────────────────────────────

function ConditionsTab({ conditions, onChange, triggerName }: { conditions: TriggerConditions; onChange: (c: TriggerConditions) => void; triggerName: string; }) {
    const { keywords } = conditions;

    const patchKeywords = (side: "match" | "exclude", p: Partial<typeof keywords.match>) =>
        onChange({ ...conditions, keywords: { ...keywords, [side]: { ...keywords[side], ...p } } });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            <KeywordsInput
                label="Match Keywords"
                hint="Message must contain at least one of these."
                value={keywords.match.value}
                strict={keywords.match.strict}
                variant="match"
                onChangeValue={v => patchKeywords("match", { value: v })}
                onChangeStrict={v => patchKeywords("match", { strict: v })}
                placeholder="e.g. glitch, glitched, glitching"
            />

            <KeywordsInput
                label="Exclude Keywords"
                hint="Message must NOT contain any of these."
                value={keywords.exclude.value}
                strict={keywords.exclude.strict}
                variant="exclude"
                onChangeValue={v => patchKeywords("exclude", { value: v })}
                onChangeStrict={v => patchKeywords("exclude", { strict: v })}
                placeholder="e.g. hunt, help, looking for"
            />

            <MatchPreview
                triggerName={triggerName}
                matchKeywords={keywords.match.value}
                matchStrict={keywords.match.strict}
                excludeKeywords={keywords.exclude.value}
                excludeStrict={keywords.exclude.strict}
            />

            <p style={S.sectionTitle}>Mention Roles</p>
            <p style={S.sectionDescription}>
                Match if the message pings any of these roles. Leave empty to skip this check.<br />
                <strong>If both keywords and roles are configured, either one is enough to match.</strong>
            </p>
            <RoleChipInput roles={conditions.mentionRoles} onChange={roles => onChange({ ...conditions, mentionRoles: roles })} />

        </div>
    );
}

// ─── Tab: Biome ───────────────────────────────────────────────────────────────

function BiomeTab({ biome, onChange }: { biome: TriggerBiome; onChange: (b: TriggerBiome) => void; }) {
    const { detectorEnabled, detectorAccounts } = settings.use(["detectorEnabled", "detectorAccounts"]);
    const patch = (p: Partial<TriggerBiome>) => onChange({ ...biome, ...p });

    const globallyDisabled = !detectorEnabled;
    const noAccounts = !detectorAccounts;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            {globallyDisabled && (
                <Note variant="danger">
                    Biome detection is disabled in the plugin settings. Enable it there first.
                </Note>
            )}
            {!globallyDisabled && noAccounts && (
                <Note variant="danger">
                    No accounts configured. Biome detection will not work until you add one in the plugin settings.
                </Note>
            )}

            <p style={S.sectionTitle}>Detection</p>

            <SwitchField
                label="Enable biome detection"
                hint="Verify the biome after joining by reading Roblox log files."
                value={biome.detectionEnabled}
                onChange={v => patch({ detectionEnabled: v })}
            />

            {biome.detectionEnabled ? (
                <>
                    <TextField
                        label="RPC Keyword"
                        hint='Matches the BloxstrapRPC "hoverText" field in the Roblox log. Case-insensitive.'
                        value={biome.detectionKeyword}
                        placeholder="e.g. GLITCHED"
                        onChange={v => patch({ detectionKeyword: v })}
                    />

                    <p style={S.sectionTitle}>Behavior</p>

                    <SwitchField
                        label="Skip redundant join"
                        hint="If already in the detected biome, skip the join. Will still notify."
                        value={biome.skipRedundantJoin}
                        onChange={v => patch({ skipRedundantJoin: v })}
                    />
                </>
            ) : (
                <Note>Enable biome detection above to configure keyword and behavior options.</Note>
            )}

        </div>
    );
}

// ─── Tab: Advanced ────────────────────────────────────────────────────────────

function AdvancedTab({ draft, patch }: { draft: Omit<Trigger, "id">; patch: (p: Partial<Omit<Trigger, "id">>) => void; }) {
    const { ignoredGuilds: settingIgnoredGuilds, ignoredChannels: settingIgnoredChannels } = settings.use([
        "ignoredGuilds", "ignoredChannels"
    ]);
    const { conditions } = draft;
    const {
        bypassMonitoredOnly, bypassIgnoredChannels, bypassIgnoredGuilds, bypassForwardIgnoredGuilds,
        bypassMatchAmbiguity, bypassLinkVerification, bypassLinkDeduplication,
        fromUser, ignoredChannels, ignoredGuilds, inChannel,
    } = conditions;

    const qtyIgnoredChannelsGlobal = settingIgnoredChannels.split(",").length;
    const qtyIgnoredGuildsGlobal = settingIgnoredGuilds.split(",").length;

    const patchConditions = (p: Partial<typeof conditions>) =>
        patch({ conditions: { ...conditions, ...p } });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            {/* ── Filters ── */}
            <p style={S.sectionTitle}>Filters</p>
            <p style={S.sectionDescription}>
                Narrow down when this trigger fires. All active filters must pass for a match.
            </p>

            <IdChipInput
                kind="user"
                label="Allowed Users"
                hint="Only match messages from these users. Leave empty to allow any user."
                ids={fromUser}
                onChange={ids => patchConditions({ fromUser: ids })}
            />
            <IdChipInput
                kind="channel"
                label="Allowed Channels"
                hint="Only match in these channels, in addition to monitored channels. Leave empty for any channel."
                ids={inChannel}
                onChange={ids => patchConditions({ inChannel: ids })}
            />
            <IdChipInput
                kind="channel"
                label="Ignored Channels"
                hint={`Never match in these channels, even if other conditions pass.${qtyIgnoredChannelsGlobal ? ` (${qtyIgnoredChannelsGlobal} globally ignored)` : ""}`}
                ids={ignoredChannels}
                onChange={ids => patchConditions({ ignoredChannels: ids })}
            />
            <IdChipInput
                kind="guild"
                label="Ignored Servers"
                hint={`Never match in these servers. Useful for servers with no-sniper policies.${qtyIgnoredGuildsGlobal ? ` (${qtyIgnoredGuildsGlobal} globally ignored)` : ""}`}
                ids={ignoredGuilds}
                onChange={ids => patchConditions({ ignoredGuilds: ids })}
            />

            {/* ── Bypasses ── */}
            <p style={S.sectionTitle}>Bypasses</p>
            <Note variant="danger" style={{ fontSize: 14 }}>
                These options disable global safety checks. Only enable them if you know what you're doing.
            </Note>

            <SwitchField
                label="Bypass monitored channels"
                hint="Allows this trigger to search for matches in any channel."
                value={bypassMonitoredOnly}
                onChange={v => patchConditions({ bypassMonitoredOnly: v })}
            />
            <SwitchField
                label="Bypass ignored channels"
                hint="Allows matching even in globally ignored channels."
                value={bypassIgnoredChannels}
                onChange={v => patchConditions({ bypassIgnoredChannels: v })}
            />
            <SwitchField
                label="Bypass ignored servers"
                hint="Allows matching even in globally ignored servers."
                value={bypassIgnoredGuilds}
                onChange={v => patchConditions({ bypassIgnoredGuilds: v })}
            />
            <SwitchField
                label="Bypass forward ignored servers"
                hint="Allows forwarding even from globally forward-ignored servers."
                value={bypassForwardIgnoredGuilds}
                onChange={v => patchConditions({ bypassForwardIgnoredGuilds: v })}
            />
            <SwitchField
                label="Bypass match ambiguity"
                hint="Always treat this trigger as unambiguous, even if multiple triggers match simultaneously."
                value={bypassMatchAmbiguity}
                onChange={v => patchConditions({ bypassMatchAmbiguity: v })}
            />
            <SwitchField
                label="Bypass link verification"
                hint="Skip Place ID verification for this trigger."
                value={bypassLinkVerification}
                onChange={v => patchConditions({ bypassLinkVerification: v })}
            />
            <SwitchField
                label="Bypass link deduplication"
                hint="Skip the duplication check for this trigger."
                value={bypassLinkDeduplication}
                onChange={v => patchConditions({ bypassLinkDeduplication: v })}
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
    const { globalWebhookUrl, forwardIgnoredGuilds } = settings.use([
        "globalWebhookUrl", "forwardIgnoredGuilds"
    ]);

    const globalWebhook = globalWebhookUrl || "";
    const qtyIgnoredGuilds = forwardIgnoredGuilds.split(",").length;

    const patch = (p: Partial<TriggerForwarding>) => onChange({ ...forwarding, ...p });
    const hasEffectiveWebhook = forwarding.webhookUrl.trim() || globalWebhook.trim();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Note variant="warning" style={{ fontSize: 14 }}>
                ⚠️ This section is intended for advanced users only. Forwarding is <strong>not required</strong> for
                normal use — most users should leave this unconfigured. Sending webhooks on every match can trigger
                Discord's rate limits and get your webhook permanently disabled. Only set this up if you know exactly
                what you are doing.
            </Note>

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

            <TextAreaField
                label="Message content"
                hint="Text sent outside the embed. Leave empty for none. Max 2000 characters."
                value={forwarding.webhookContent}
                onChange={v => patch({ webhookContent: v })}
                maxLength={2000}
            />

            <TextAreaField
                label="Embed description"
                hint="Text to prepended to the embed description. Leave empty for default. Max 2000 characters."
                value={forwarding.webhookEmbedDescription}
                onChange={v => patch({ webhookEmbedDescription: v })}
                maxLength={2000}
            />

            {!hasEffectiveWebhook && (
                <Note variant="warning">
                    No webhook is configured. Forwarding will do nothing even when enabled. Set a webhook here or in plugin settings.
                </Note>
            )}

            {/* ── On Match ── */}
            <p style={S.sectionTitle}>On Match</p>

            <SwitchField
                label="Enabled"
                hint="Sends a message to the webhook when the trigger matches."
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
                    hint="Sends a message to the webhook when the biome is detected."
                    value={forwarding.onDetection.enabled}
                    onChange={v => patch({ onDetection: { enabled: v } })}
                />
                <Note>
                    For this to work, you obviously need to have biome detection set up in settings, and you need to join the biome to actually do the detection. It is impossible to verify if a biome is real or not without joining it.
                </Note>
            </>}

            {!showBiome && (
                <Note>
                    On-detection forwarding is only available for trigger types that support biome detection
                    (Rare Biome, Event Biome, Biome, Weather, Custom).
                </Note>
            )}

            {/* ── Forwarding Filters ── */}
            <p style={S.sectionTitle}>Forwarding Filters</p>
            <p style={S.sectionDescription}>
                Messages originating from these will <strong>never</strong> be forwarded. Useful for guilds with no-sharing policies, or other reasons you might have to not want a forward.
            </p>
            <IdChipInput
                kind="guild"
                label="Excluded Servers"
                hint={`Add any server you don't want to forward matches from.${qtyIgnoredGuilds > 0 ? ` (${qtyIgnoredGuilds} globally ignored)` : ""}`}
                ids={forwarding.excludedGuilds ?? []}
                onChange={ids => patch({ excludedGuilds: ids })}
            />
            <IdChipInput
                kind="channel"
                label="Excluded Channels"
                hint="Add any channel you don't want to forward matches from."
                ids={forwarding.excludedChannels ?? []}
                onChange={ids => patch({ excludedChannels: ids })}
            />

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
        try {
            // logger.debug("saving draft.state: ", draft.state);
            if (isEditing) await updateTrigger(trigger.id, draft);
            else await addTrigger(draft);
            showToast(isEditing ? `Trigger "${draft.name}" updated!` : "Trigger added!", Toasts.Type.SUCCESS);
            modalProps.onClose();
        } catch (error) {
            showToast(`Failed to save trigger: ${error}`, Toasts.Type.FAILURE);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;
        try {
            await deleteTrigger(trigger.id);
            showToast("Trigger deleted.", Toasts.Type.MESSAGE);
        } catch (error) {
            showToast(`Failed to delete trigger: ${error}`, Toasts.Type.FAILURE);
        }
        modalProps.onClose();
    };

    const handleCopy = () => {
        confirmWebhookThenRun([trigger!], () => {
            try {
                const { id, ...rest } = trigger!;
                navigator.clipboard.writeText(JSON.stringify([rest], null, 2));
                showToast("Trigger copied to clipboard!", Toasts.Type.SUCCESS);
            } catch (e) {
                showToast(`Failed to copy trigger: ${e}`, Toasts.Type.FAILURE);
            }
        });
    };

    const handleSafeExport = () => {
        try {
            const sanitized = safeExportDraft(draft);
            const blob = new Blob([JSON.stringify([sanitized], null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `solsradar-trigger-${draft.name.trim().replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("Trigger exported (safe)!", Toasts.Type.SUCCESS);
        } catch (e) {
            showToast(`Failed to export trigger: ${e}`, Toasts.Type.FAILURE);
        }
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
                {innerTab === "conditions" && <ConditionsTab conditions={draft.conditions} onChange={c => patch({ conditions: c })} triggerName={draft.name} />}
                {innerTab === "biome" && draft.biome && <BiomeTab biome={draft.biome} onChange={b => patch({ biome: b })} />}
                {innerTab === "advanced" && <AdvancedTab draft={draft} patch={patch} />}
                {innerTab === "forwarding" && <ForwardingTab forwarding={draft.forwarding} onChange={f => patch({ forwarding: f })} showBiome={showBiome} />}
            </ModalContent>

            <ModalFooter separator>
                <Button size="small" variant="positive" disabled={!isValid} onClick={handleSave} style={{ marginLeft: "8px" }}>
                    {isEditing ? "Save" : "Create"}
                </Button>
                {isEditing && (
                    <>
                        <Button size="small" variant="dangerPrimary" onClick={handleDelete} style={{ marginLeft: "8px" }}>
                            Delete
                        </Button>
                        <Button size="small" variant="secondary" onClick={handleCopy} style={{ marginLeft: "8px" }}>
                            Copy to clipboard
                        </Button>
                        <Button size="small" variant="link" onClick={handleSafeExport} style={{ marginLeft: "8px" }}>
                            Safe Export
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
