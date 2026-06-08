/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { openUserProfile } from "@utils/discord";
import { Alerts, React } from "@webpack/common";

import {
    getCurrentChangelog,
    getCurrentVersion,
    getCurrentVersionEntries,
    getLatestKnownChangelog,
    getLatestKnownVersion,
    hasNewVersionAvailable
} from "../../../utils";

// ─── Changelog ────────────────────────────────────────────────────────────────

const currentChangelog = getCurrentChangelog();
const latestChangelog = getLatestKnownChangelog();

// ─── Styles ───────────────────────────────────────────────────────────────────

const CHANGELOG_COLORS: Record<string, string> = {
    Added: "hsl(140deg 50% 44%)",
    Improved: "hsl(210deg 80% 60%)",
    Fixed: "hsl(38deg 95% 50%)",
    Removed: "hsl(0deg 75% 60%)",
    Other: "hsl(0deg 0% 70%)",
};

// ─── Components ──────────────────────────────────────────────────────────

type CreditRole = "Author" | "Credits" | "Thanks" | "Framework";

interface CreditEntry {
    name: string;
    role: CreditRole;
    note?: string;
    url?: string;
}

const CREDITS: CreditEntry[] = [
    { name: "masutty", role: "Author", note: "oh hey thats me", url: "https://gitlab.com/masutty" },
    { name: "maxstellar", role: "Credits", note: "Biome icons", url: "https://github.com/maxstellar" },
    { name: "vexthecoder", role: "Credits", note: "Merchant icons", url: "https://github.com/vexsyx" },
    { name: "cresqnt-sys", role: "Credits", note: "Biome detection logic", url: "https://github.com/cresqnt-sys" },
    { name: "MonaSync", role: "Thanks", note: "ADB method; testing & debugging" },
    { name: "Vencord", role: "Framework", note: "This plugin wouldn't exist without it!", url: "https://vencord.dev" },
];

const ROLE_COLOR: Record<CreditRole, string> = {
    Author: "var(--brand-500)",
    Credits: "hsl(140deg 50% 44%)",
    Thanks: "hsl(38deg 95% 50%)",
    Framework: "hsl(270deg 60% 58%)",
};

const LINKS = [
    {
        label: "Source code",
        url: "https://gitlab.com/masutty/solradar",
        icon: "🔗",
    },
    {
        label: "Installer source code",
        url: "https://gitlab.com/masutty/solradar-installer",
        icon: "📦",
    },
    {
        label: "Support server",
        url: null,
        icon: "💬",
        onClick: () => Alerts.show({
            title: "Join the support server?",
            body: (
                <Paragraph>
                    This server is intended for support, announcements, bug reports, suggestions, and general discussion about SolRadar.
                    <br /><br />

                    Please be aware that some moderators from other communities may also be present there, and{" "}
                    <span style={{ color: "#ff4d4f", fontWeight: 700 }}>
                        they might warn you on their community for just being on this server!
                    </span>

                    <br /><br />

                    If that concerns you,{" "}
                    <span style={{ color: "#faad14", fontWeight: 700 }}>
                        I strongly recommend joining with an alt Discord account instead of your main one
                    </span>
                    , OR message me privately for support.
                </Paragraph>
            ),
            confirmText: "Understood!",
            cancelText: "Nevermind",
            onConfirm: () => window.open("https://discord.gg/EfWHGGz7MG", "_blank"),
        }),
    },
    {
        label: "I need help!",
        url: null,
        icon: "🆘",
        onClick: () => Alerts.show({
            title: "Attention!",
            body: (
                <Paragraph>
                    This will my profile (masutty), the author of SolRadar.
                    <br /><br />

                    Feel free to message me if you've found a bug, need help with the plugin, want to report an issue, or have a suggestion for a future feature.
                    <br /><br />

                    Please keep in mind that I may be busy with work, personal projects, or other responsibilities, so I might not respond immediately.
                    <br /><br />

                    <span style={{ color: "#ff4d4f", fontWeight: 600 }}>
                        Also, please do not contact me asking for "faster joins" or special configurations. The default plugin settings are the configuration I personally recommend and use.
                    </span>

                    <br /><br />

                    <span style={{ color: "#ffcc00", fontWeight: 600 }}>
                        Finally, please avoid sending repeated messages or spam. If you do, I may block you without warning.
                    </span>
                </Paragraph>
            ),
            confirmText: "Understood!",
            cancelText: "Nevermind",
            // onConfirm: () => window.open("https://discord.com/channels/@me/188851299255713792", "_blank"),
            // onConfirm: () => NavigationRouter.transitionTo("https://discord.com/channels/@me/1454842493328953559"),
            onConfirm: () => openUserProfile("188851299255713792"),
        }),
    },
];

function CreditCard({ entry }: { entry: CreditEntry; }) {
    const color = ROLE_COLOR[entry.role];

    const content = (
        <div style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "10px 12px", borderRadius: 8,
            background: "var(--background-mod-subtle)",
            height: "100%", boxSizing: "border-box",
        }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-default)", lineHeight: 1.2 }}>
                {entry.name}
            </div>
            <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.05em", color,
            }}>
                {entry.role}
            </div>
            {entry.note && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.35 }}>
                    {entry.note}
                </div>
            )}
        </div>
    );

    const wrapStyle: React.CSSProperties = {
        flex: "1 1 180px", minWidth: 160, textDecoration: "none", display: "block",
        transition: "opacity 0.12s",
    };

    if (entry.url) {
        return (
            <a href={entry.url} target="_blank" rel="noreferrer" style={wrapStyle}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.65")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
                {content}
            </a>
        );
    }

    return <div style={wrapStyle}>{content}</div>;
}

// ─── UpdatesTab ───────────────────────────────────────────────────────────────

export function UpdatesTab() {
    const currentVersion = getCurrentVersion();
    const latestVersion = getLatestKnownVersion() ?? "UNKNOWN";

    const updateAvailable = hasNewVersionAvailable();

    const changelog = updateAvailable
        ? getLatestKnownChangelog()
        : getCurrentVersionEntries();

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                gap: 16,
                boxSizing: "border-box"
            }}
        >

            {/* ── Version Status ── */}
            <div style={{
                borderRadius: 10,
                background: "var(--background-mod-subtle)",
                border: "1px solid var(--background-mod-normal)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
            }}>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-default)", marginBottom: 6 }}>
                        SolRadar
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                        SolRadar is a Vencord plugin maintained by masutty that monitors your Discord channels
                        for Roblox server links — automatically notifying and/or joining them the moment
                        they're detected, based on your configuration.
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--text-muted)" }}>
                    <div>Installed version: {currentVersion}</div>
                    <div>Latest known version: {latestVersion}</div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {LINKS.map(link => (
                        <Button
                            key={link.label}
                            onClick={() => {
                                if (link.onClick) {
                                    link.onClick();
                                } else if (link.url) {
                                    window.open(link.url, "_blank");
                                }
                            }}
                            variant="none"
                            size="small"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: "1px solid var(--background-modifier-accent)",
                                background: "transparent",
                                color: "var(--text-link)",
                                fontSize: 12,
                                cursor: "pointer",
                                transition: "all 0.1s",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = "var(--background-secondary)";
                                e.currentTarget.style.borderColor = "var(--brand-500)";
                                e.currentTarget.style.color = "var(--brand-500)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.borderColor = "var(--background-modifier-accent)";
                                e.currentTarget.style.color = "var(--text-link)";
                            }}
                        >
                            {link.icon} {link.label}
                        </Button>
                    ))}
                </div>

            </div>

            {/* ── Update Notice ── */}
            {updateAvailable && (
                <div
                    style={{
                        borderRadius: 10,
                        padding: "14px 16px",
                        border: "1px solid hsl(140deg 50% 44% / 0.4)",
                        background: "hsl(140deg 50% 44% / 0.08)"
                    }}
                >
                    <div
                        style={{
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 4,
                            color: "hsl(140deg 50% 44%)"
                        }}
                    >
                        New update available
                    </div>

                    <div
                        style={{
                            fontSize: 13,
                            color: "var(--text-muted)"
                        }}
                    >
                        Version {latestVersion} is available. Reinstall the plugin
                        via SolRadar-Installer, or pull the update through git!
                    </div>
                </div>
            )}

            {/* ── Changelog ── */}
            <div>
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 8
                    }}
                >
                    Changelog ({currentVersion})
                </span>

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                    }}
                >
                    {changelog.map((entry, i) => (
                        <div
                            key={i}
                            style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 8,
                                padding: "10px 12px",
                                borderRadius: 8,
                                background: "var(--background-mod-subtle)"
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    background: `${CHANGELOG_COLORS[entry.type]}22`,
                                    color: CHANGELOG_COLORS[entry.type],
                                    flexShrink: 0
                                }}
                            >
                                {entry.type}
                            </span>

                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    minWidth: 0
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: "var(--text-default)"
                                    }}
                                >
                                    {entry.text}
                                </span>

                                {entry.description && (
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: "var(--text-muted)",
                                            lineHeight: 1.4
                                        }}
                                    >
                                        {entry.description}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Credits ── */}
            <div>
                <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.07em", color: "var(--text-muted)",
                    display: "block", marginBottom: 8,
                }}>
                    Credits
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CREDITS.map(entry => <CreditCard key={entry.name} entry={entry} />)}
                </div>
            </div>

        </div>
    );
}
