/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { PluginNative } from "@utils/types";
import { React, TextInput, Tooltip } from "@webpack/common";

import { settings } from "../../../settings";
import { getEffectiveKillTargets } from "../../../utils";
import { ChipKind } from "../../ui/IdChipInput";
import { Note } from "../../ui/Note";
import { Setting } from "./Setting";

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../../../native")>;

// ─── Shared styles ────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 4,
    marginTop: 20,
};

// ─── Kill process check ───────────────────────────────────────────────────────

type ProcessCheckResult = { pattern: string; matches: { pid: number; name: string; }[]; };

async function checkProcesses(matchBy: "name" | "title", patterns: string[]): Promise<ProcessCheckResult[]> {
    return Promise.all(patterns.map(async pattern => {
        const procs = matchBy === "title"
            ? await Native.getProcess({ type: "windowtitle", windowTitle: pattern })
            : await Native.getProcess({ type: "tasklist", processName: pattern });
        return { pattern, matches: procs.map(p => ({ pid: p.pid, name: p.name })) };
    }));
}

function ProcessCheckResults({ results }: { results: ProcessCheckResult[]; }) {
    return (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {results.length === 0 && (
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No process names configured.</span>
            )}
            {results.map(r => r.matches.length === 0 ? (
                <span key={r.pattern} style={{ fontSize: 12, color: "var(--status-danger)" }}>
                    ❌ {r.pattern} - not found
                </span>
            ) : r.matches.map(m => (
                <span key={`${r.pattern}-${m.pid}`} style={{ fontSize: 12, color: "var(--status-positive)" }}>
                    ✅ {m.name} (PID {m.pid})
                </span>
            )))}
        </div>
    );
}

// Used when a hardcoded macro preset is selected - no editable field to merge the button into.
function CheckProcessesButton() {
    settings.use(["macroType"]);
    const [results, setResults] = React.useState<ProcessCheckResult[] | null>(null);
    const [checking, setChecking] = React.useState(false);

    const handleCheck = async () => {
        setChecking(true);
        setResults(null);
        const { matchBy, values } = getEffectiveKillTargets();
        setResults(await checkProcesses(matchBy, [...values]));
        setChecking(false);
    };

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--background-mod-subtle)",
        }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button size="medium" variant="secondary" onClick={handleCheck} disabled={checking}>
                    {checking ? "Checking…" : "Check processes"}
                </Button>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Lists the actual running processes matched by this preset.
                </span>
            </div>
            {results && <ProcessCheckResults results={results} />}
        </div>
    );
}

// Used in Custom mode - merges the process name/window title input and the check button into one row.
function MacroProcessNameEntry() {
    const { killProcessNames, killMatchBy } = settings.use(["killProcessNames", "killMatchBy"]);
    const [raw, setRaw] = React.useState(killProcessNames ?? "");
    const [results, setResults] = React.useState<ProcessCheckResult[] | null>(null);
    const [checking, setChecking] = React.useState(false);

    React.useEffect(() => setRaw(killProcessNames ?? ""), [killProcessNames]);

    const commit = (v: string) => { settings.store.killProcessNames = v; };

    const isTitle = killMatchBy === "title";

    const handleCheck = async () => {
        setChecking(true);
        setResults(null);
        const { matchBy, values } = getEffectiveKillTargets();
        setResults(await checkProcesses(matchBy, [...values]));
        setChecking(false);
    };

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--background-mod-subtle)",
        }}>
            <span style={{ color: "var(--control-secondary-text-default)", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                {isTitle ? "Macro Window Title" : "Macro Process Name"}
                <Tooltip text={isTitle
                    ? "Window title(s) of the macro, comma-separated. Wildcards like FishSol* are supported and recommended - useful for script-based macros (e.g. AutoHotkey) that share a single interpreter process, where matching by process name would also kill unrelated scripts."
                    : "To find out a process name, open Task Manager → \"Details\" tab and copy the value under \"Name\" for your macro's process."}
                >
                    {props => (
                        <span {...props} style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            background: "var(--background-mod-strong)",
                            color: "var(--text-muted)",
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "help",
                            flexShrink: 0,
                            userSelect: "none",
                        }}>?</span>
                    )}
                </Tooltip>
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
                {isTitle
                    ? "Type the window title(s) of the macro to terminate once a snipe happens. Comma-separated for multiple. Wildcards (*) are supported and recommended if the title includes a version number."
                    : "Type what process names should be terminated once a snipe happens. You can provide multiple process names by separating each via comma. This is case-insensitive. File type is optional, but recommended."}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <TextInput
                    style={{ flex: 1 }}
                    value={raw}
                    onChange={setRaw}
                    onBlur={() => commit(raw)}
                    placeholder={isTitle ? "FishSol*" : "AutoHotkeyU64.exe, MacroTool.exe"}
                />
                <Button size="medium" variant="primary" onClick={handleCheck} disabled={checking}>
                    {checking ? "Checking…" : "Check"}
                </Button>
            </div>
            {results && <ProcessCheckResults results={results} />}
        </div>
    );
}

// ─── ADB section ─────────────────────────────────────────────────────────────

function AdbEntries() {
    const { ldpAdbDeviceSerial } = settings.use(["ldpAdbDeviceSerial"]);
    const [devicesOutput, setDevicesOutput] = React.useState<string | null>(null);
    const [checking, setChecking] = React.useState(false);

    const handleCheck = async () => {
        setChecking(true);
        setDevicesOutput(null);
        const result = await Native.listAdbDevices(settings.store.ldpAdbPath);
        setDevicesOutput(result.ok ? result.output : `Error: ${result.error}`);
        setChecking(false);
    };

    return (
        <>
            <Setting id="ldpAdbPath" label="ADB Path" description="Path to adb.exe." />
            <div style={{
                display: "flex",
                flexDirection: "column",
                padding: "10px 14px",
                borderRadius: 8,
                background: "var(--background-mod-subtle)",
            }}>
                <span style={{ color: "var(--control-secondary-text-default)", fontSize: 14, fontWeight: 500 }}>
                    ADB Device Serial
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
                    Serial of the target device. Default: emulator-5554
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    <TextInput
                        style={{ flex: 1 }}
                        value={ldpAdbDeviceSerial ?? ""}
                        onChange={v => { settings.store.ldpAdbDeviceSerial = v; }}
                        placeholder="emulator-5554"
                    />
                    <Button size="medium" variant="primary" onClick={handleCheck} disabled={checking}>
                        {checking ? "Checking…" : "Check devices"}
                    </Button>
                </div>
                {devicesOutput && (
                    <pre style={{
                        margin: "6px 0 0",
                        padding: "8px 10px",
                        background: "var(--background-mod-strong)",
                        borderRadius: "var(--radius-sm, 4px)",
                        color: "var(--text-default)",
                        fontSize: 12,
                        fontFamily: "var(--font-code)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                    }}>
                        {devicesOutput}
                    </pre>
                )}
            </div>
            <Setting id="ldpAdbPackageName" label="ADB Package Name" description="Package to force-stop on the device. Default: com.roblox.client" />
        </>
    );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingEntry = {
    id: keyof typeof settings.store;
    label: string;
    description?: string;
    tooltip?: string;
    chipKind?: ChipKind;
};

type Section = {
    title: string;
    note?: React.ReactNode;
    entries: SettingEntry[];
    CustomEntries?: React.FC;
    after?: React.ReactNode;
};

// ─── SettingsTab ──────────────────────────────────────────────────────────────

export function SettingsTab() {
    const {
        detectorEnabled,
        robloxToken,
        linkVerification,
        onBiomeFalse,
        onBiomeEnd,
        onBiomeTimeout,
        sendAdbSignal,
        sendKillProcessSignal,
        macroType,
    } = settings.use([
        "detectorEnabled",
        "robloxToken",
        "linkVerification",
        "onBiomeFalse",
        "onBiomeEnd",
        "onBiomeTimeout",
        "sendAdbSignal",
        "sendKillProcessSignal",
        "macroType",
    ]);

    const [search, setSearch] = React.useState("");
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    const hasToken = !!robloxToken;
    const verificationEnabled = linkVerification !== "disabled";

    // ── Simple sections ───────────────────────────────────────────────────────

    const simpleSections: Section[] = [
        {
            title: "General",
            entries: [
                { id: "autoJoinEnabled", label: "Auto-joins", description: "Allow triggers to auto-join servers. Disable to quickly pause all auto-joins without touching individual triggers." },
                { id: "notificationEnabled", label: "Notifications", description: "Show a desktop notification when a trigger matches." },
                { id: "privateServerLink", label: "Private Server Link", description: "Your private server link. Required for some actions." },
            ],
        },
        {
            title: "User Interface",
            entries: [
                { id: "anonymizeEverything", label: "Anonymize Everything", description: "Hide every information that could lead to identifying the origin of your snipe. Recommended to keep this enabled if you're going to post screenshots of your snipes.", tooltip: "This will hide the author, server, channel, message and logs for each snipe in the history page. You may click to reveal each entry individually." },
                { id: "shouldCheckForUpdates", label: "Check for Updates", description: "Check for new versions of SolRadar on startup.", tooltip: "This will check for new versions of SolRadar on startup and display a notification if one is available. Runs once per day." },
            ],
        },
        {
            title: "Snipe Configuration",
            entries: [
                { id: "flattenEmbeds", label: "Interpret Embeds", description: "Include embed titles and descriptions when matching triggers. Useful for macro servers that post biomes inside embeds rather than plain text." },
                { id: "interpretJoinguardLinks", label: "Interpret Joinguard Links", description: "Process links from Sol's Stat Tracker Joinguard. These open your browser for Cloudflare verification and cannot be place-verified." },
                { id: "resolveAmbiguousLinks", label: "Force Match on Multiple Links", description: "When a message has more than one link type (e.g. a share link alongside a private server link), use the first one found. By default, messages with multiple link types are skipped as ambiguous." },
                { id: "deduplicateLinks", label: "Deduplicate Links", description: "Ignore a link if the same one was seen in the last 10 minutes for the same trigger." },
                { id: "joinMode", label: "Join Mode", description: "How to handle the running Roblox instance when a trigger fires." },
                { id: "sendAdbSignal", label: "Send ADB Signal", description: "Send a close signal to the emulator via ADB after launching the join URI. Requires ADB configuration in Advanced." },
                {
                    id: "sendKillProcessSignal", label: "Send Macro Kill Signal",
                    description: "Try to kill any running macro process immediately on snipe.",
                    tooltip: "When enabled, once a biome is sniped, try to kill any process running with an specified name. This is so you don't report a fake biome to your macro server, if any.",
                },
                ...(sendKillProcessSignal ? [
                    {
                        id: "macroType" as const, label: "Macro Type",
                        description: "Select which macro you are using.",
                        tooltip: "These are just pre-filled process names known for each macro type. If the macro you are using does not exist in this list, please pick Custom and provide the process name manually. If a preset stops matching anything, either you renamed the original .exe file, or your macro's version (updated or outdated) ships under a different file name than the one known here - in that case, switch to Custom and confirm the process name yourself.",
                    },
                ] : []),
                ...(sendKillProcessSignal && macroType === "custom" ? [
                    {
                        id: "killMatchBy" as const, label: "Match By",
                        description: "Whether to match your Custom target by process name or by window title.",
                        tooltip: "Use Process Name for regular .exe tools. Use Window Title for script-based macros (e.g. AutoHotkey/.ahk) that run under a shared interpreter process - matching those by process name would also kill every other unrelated script using that same interpreter. Window Title supports wildcards (*), useful when the title includes a version number.",
                    },
                ] : []),
            ] as SettingEntry[],
            after: !sendKillProcessSignal ? undefined
                : macroType === "custom" ? <MacroProcessNameEntry />
                : <CheckProcessesButton />,
        },
        {
            title: "Monitoring",
            entries: [
                { id: "monitoredGuilds", label: "Monitored Servers", chipKind: "guild", description: "If empty, the plugin monitors every server you're in. Add servers here to restrict it to only those.", tooltip: "Adding even one server means all other servers are silently ignored. Only use this if you want to restrict the plugin to specific servers." },
                { id: "monitoredChannels", label: "Monitored Channels", chipKind: "channel", description: "If empty, the plugin monitors every channel in every server you're in. Add channels here to restrict it to only those.", tooltip: "Adding even one channel means every other channel is silently ignored. Only use this if you want to restrict the plugin to specific channels." },
                { id: "ignoredGuilds", label: "Ignored Servers", chipKind: "guild", description: "Messages from these servers are always ignored, regardless of trigger settings." },
                { id: "ignoredChannels", label: "Ignored Channels", chipKind: "channel", description: "Messages in these channels are always ignored, regardless of trigger settings." },
                { id: "ignoredUsers", label: "Ignored Users", chipKind: "user", description: "Messages from these users are always ignored, regardless of trigger settings." },
            ],
        },
        ...(detectorEnabled ? [{
            title: "Biome Actions",
            note: (
                <Note variant="warning">
                    Biome detection settings are managed on the plugin page in Vencord's plugin menu.
                    Changes there require a Discord restart.
                </Note>
            ),
            entries: [
                { id: "onBiomeFalse" as const, label: "Action on Fake Biome", description: "What to do when the joined biome doesn't match what was announced." },
                ...(onBiomeFalse !== "nothing" ? [
                    { id: "biomeFalseActionTimeout" as const, label: "Fake Biome Action Delay (ms)", description: "Time to wait before executing. A cancellation prompt is shown during this window." },
                ] : []),
                { id: "onBiomeEnd" as const, label: "Action on Biome End", description: "What to do when a confirmed biome ends." },
                ...(onBiomeEnd !== "nothing" ? [
                    { id: "biomeEndActionTimeout" as const, label: "Biome End Action Delay (ms)", description: "Time to wait before executing. A cancellation prompt is shown during this window." },
                ] : []),
                { id: "onBiomeTimeout" as const, label: "Action on Biome Timeout", description: "What to do when biome detection times out without detecting any biome." },
                ...(onBiomeTimeout !== "nothing" ? [
                    { id: "biomeTimeoutActionTimeout" as const, label: "Biome Timeout Action Delay (ms)", description: "Time to wait before executing. A cancellation prompt is shown during this window." },
                ] : []),
                ...((onBiomeFalse !== "nothing" || onBiomeEnd !== "nothing" || onBiomeTimeout !== "nothing") ? [
                    { id: "skipActionConfirmation" as const, label: "Skip Action Confirmation", description: "Execute actions immediately, without showing the cancellation prompt." },
                ] : []),
            ] as SettingEntry[],
        }] : []),
        ...(hasToken ? [{
            title: "Link Verification",
            note: (
                <Note variant="warning">
                    Your Roblox token is sensitive — treat it like a password and never share it.
                    Use an alt account's token when possible.
                </Note>
            ),
            entries: [
                { id: "linkVerification" as const, label: "Verification Mode" },
                ...(verificationEnabled ? [
                    { id: "allowedPlaceIds" as const, label: "Allowed Place IDs", description: "Comma-separated. Only links pointing to these Place IDs will be accepted. Leave empty to allow any place." },
                    { id: "onBadLink" as const, label: "Action on Bad Link" },
                ] : []),
            ] as SettingEntry[],
        }] : []),
    ];

    // ── Advanced sections ─────────────────────────────────────────────────────

    const advancedSections: Section[] = [
        {
            title: "ADB",
            note: (
                <>
                    {!sendAdbSignal && (
                        <Note variant="warning">
                            "LDPlayer ADB" is not selected as the close mode. These settings will have no effect.
                        </Note>
                    )}
                    <Note>
                        When a snipe triggers, the plugin launches the join URI and simultaneously sends a close signal via ADB.
                    </Note>
                </>
            ),
            entries: [],
            CustomEntries: AdbEntries,
        },
        {
            title: "Forwarding",
            entries: [
                { id: "globalWebhookUrl", label: "Global Webhook URL", description: "Fallback webhook URL used when a trigger has forwarding enabled but no specific webhook configured." },
                { id: "censorWebhooks", label: "Censor Webhooks", description: "Redact sender and channel info from forwarded webhook messages." },
                { id: "forwardIgnoredGuilds", label: "No-Forward Servers", chipKind: "guild", description: "Messages from these servers are never forwarded." },
            ],
        },
        {
            title: "Miscellaneous",
            note: <Note variant="danger">Do <strong>NOT</strong> change these unless you know what you're doing.</Note>,
            entries: [
                { id: "ignoreWebhookForwards", label: "Ignore Webhook Forwards", description: 'Ignore any message whose embed footer contains "solradar". Prevents the plugin from acting on its own forwarded webhooks.' },
                { id: "advancedEmbedFlattening", label: "Advanced Embed Flattening", description: "Also extract embed fields and message component URLs when flattening embeds." },
                { id: "customNotificationSoundDelay", label: "Notification Sound Delay (ms)", description: "Delay before playing the trigger's custom notification sound." },
                { id: "omitAdbErrorNotifications", label: "Omit ADB Error Notifications", description: "Suppress the notification shown when an ADB kill signal fails. The error is still logged to the console." },
                { id: "hideInactiveIndicator", label: "Hide Inactive Indicator", description: "Hide the red dot on the menu button when auto-join is disabled." },
            ],
        },
    ];

    // ── Filtering ─────────────────────────────────────────────────────────────

    const q = search.trim().toLowerCase();

    function filterSections(sections: Section[]): Section[] {
        if (!q) return sections;
        return sections
            .map(s => {
                if (s.CustomEntries) return s.title.toLowerCase().includes(q) ? s : null;
                return { ...s, entries: s.entries.filter(e => e.label.toLowerCase().includes(q)) };
            })
            .filter((s): s is Section => s !== null && (!!s.CustomEntries || s.entries.length > 0));
    }

    const filteredSimple = filterSections(simpleSections);
    const filteredAdvanced = filterSections(advancedSections);
    const advancedVisible = showAdvanced || (!!q && filteredAdvanced.length > 0);

    function renderSection(section: Section) {
        return (
            <React.Fragment key={section.title}>
                <p style={sectionTitle}>{section.title}</p>
                {section.note}
                {section.CustomEntries
                    ? <section.CustomEntries />
                    : section.entries.map(e => (
                        <Setting key={e.id} id={e.id} label={e.label} description={e.description} tooltip={e.tooltip} chipKind={e.chipKind} />
                    ))
                }
                {section.after}
            </React.Fragment>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 20 }}>

            <TextInput
                value={search}
                onChange={setSearch}
                placeholder="Search settings…"
                style={{ marginBottom: 4 }}
            />

            {/* Simple sections */}
            {filteredSimple.map(renderSection)}

            {/* Advanced toggle */}
            {!q && (
                <button
                    onClick={() => setShowAdvanced(v => !v)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 20,
                        background: "none",
                        border: "none",
                        borderTop: "1px solid var(--background-mod-subtle)",
                        padding: "10px 0 0",
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                    }}
                >
                    <span style={{
                        color: "var(--text-muted)",
                        fontSize: 10,
                        display: "inline-block",
                        lineHeight: 1,
                        transition: "transform 0.15s",
                        transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)",
                    }}>▶</span>
                    <span style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}>
                        Advanced
                    </span>
                </button>
            )}

            {/* Advanced sections */}
            {advancedVisible && filteredAdvanced.map(renderSection)}

            {filteredSimple.length === 0 && filteredAdvanced.length === 0 && (
                <Note>No settings found for "{search}".</Note>
            )}

        </div>
    );
}
