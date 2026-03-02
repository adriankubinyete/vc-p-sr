/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { settings } from "../../../../settings";
import { Setting } from "./Setting";

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

const note = (variant: "default" | "warning" | "danger" = "default"): React.CSSProperties => ({
    color: variant === "default" ? "var(--text-muted)"
        : variant === "warning" ? "var(--text-warning)"
            : "var(--text-danger)",
    background: variant === "default" ? "var(--background-modifier-accent)"
        : variant === "warning" ? "hsl(38deg 95% 54% / 10%)"
            : "hsl(359deg 87% 54% / 10%)",
    border: `1px solid ${variant === "default" ? "transparent"
        : variant === "warning" ? "hsl(38deg 95% 54% / 25%)"
            : "hsl(359deg 87% 54% / 25%)"
        }`,
    fontSize: 12,
    lineHeight: 1.5,
    padding: "8px 12px",
    borderRadius: 6,
});

const noteBaseStyle: React.CSSProperties = {
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.5,
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--background-modifier-accent)",
};

const warningNote: React.CSSProperties = {
    ...noteBaseStyle,
    color: "var(--text-warning)",
    background: "hsl(38deg 95% 54% / 10%)",
};

// ─── SettingsTab ──────────────────────────────────────────────────────────────

export function SettingsTab() {
    const { detectorEnabled, linkVerification } = settings.use([
        "detectorEnabled",
        "linkVerification",
        "robloxToken",
    ]);

    const verificationEnabled = linkVerification !== "disabled";
    const hasToken = !!settings.store.robloxToken;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

            {/* ── General ──────────────────────────────────────────────── */}
            <p style={sectionTitle}>General</p>
            <Setting id="autoJoinEnabled" label="Auto-join" />
            <Setting id="notificationEnabled" label="Notifications" />
            <Setting id="flattenEmbeds" label="Interpret Embeds"
                description="Merge embed titles/descriptions into message content when matching triggers. Useful for macro bots." />

            {/* ── Plugin Icon ───────────────────────────────────────────── */}
            {/* <p style={sectionTitle}>Plugin Icon</p>
            <Setting id="pluginIconShortcutAction" label="Right-click Shortcut" /> */}

            {/* ── Game Launch ───────────────────────────────────────────── */}
            <p style={sectionTitle}>Game Launch</p>
            <Setting id="closeGameBeforeJoin" label="Close Game Before Joining" description="Adds ~200–400ms to your join time but prevents Roblox from silently failing to launch. Disable only if you always close your game manually before sniping." />
            {/* <p style={note("default")}>
                Adds ~200–400ms to your join time but prevents Roblox from silently failing to launch.
                Disable only if you always close your game manually before sniping.
            </p> */}

            {/* ── Channel Monitoring ────────────────────────────────────── */}
            <p style={sectionTitle}>Channel Monitoring</p>
            <Setting id="monitoredChannels" label="Monitored Channels"
                description="Comma-separated channel IDs. Leave empty to monitor no channels." />
            <Setting id="NEVER_MONITOR_THESE_GUILDS" label="Ignored Guilds"
                description="Comma-separated guild IDs. Messages from these guilds are always ignored." />

            {/* ── Link Verification ─────────────────────────────────────── */}
            <p style={sectionTitle}>Link Verification</p>
            <Setting id="linkVerification" label="Verification Mode" />

            {verificationEnabled ? (
                <>
                    <Setting id="allowedPlaceIds" label="Allowed Place IDs"
                        description="Comma-separated. If empty, all place IDs are allowed." />
                    <Setting id="onBadLink" label="Action on Bad Link" />
                    {!hasToken && <p style={note("danger")}>
                        You don't have a roblox token configured.<br />You need a roblox token to verify links. Go to the plugin page in Vencord's plugin menu to manage it.
                    </p>}
                    <p style={note("warning")}>
                        Reminder: Link verification requires a valid roblox token. Keep this private and never share it with anyone. It is strongly advised to create an alt account just to use it's token for this.
                    </p>
                </>
            ) : (
                <p style={note("danger")}>
                    Link verification is disabled.
                </p>
            )}

            {/* ── Biome Detection ───────────────────────────────────────── */}
            <p style={sectionTitle}>Biome Detection</p>
            <p style={note("warning")}>
                All biome detection settings require a Discord restart to take effect. Go to the plugin page in Vencord's plugin menu to manage it.
            </p>
            {/* <Setting id="detectorEnabled" label="Enable Biome Detector" />

            {detectorEnabled ? (
                <>
                    <Setting id="detectorAccounts" label="Monitored Accounts"
                        description="Comma-separated Roblox usernames. These accounts must be logged in on this machine." />
                    <Setting id="detectorIntervalMs" label="Polling Interval (ms)"
                        description="How often log files are read. Recommended: 2000. Keep above 1000." />
                    <Setting id="detectorTimeoutMs" label="Detection Timeout (ms)"
                        description="How long to wait for a biome after joining before giving up and releasing the join lock. Recommended: 30000." />
                    <p style={note("warning")}>
                        All detector settings require a Discord restart to take effect.
                        Accounts that cannot be resolved to a Roblox user ID are silently skipped.
                    </p>
                </>
            ) : (
                <p style={note("default")}>
                    Biome detection is disabled. When enabled, the plugin reads your Roblox log files
                    to verify that the biome you joined matches what was announced.
                </p>
            )} */}

        </div>
    );
}
