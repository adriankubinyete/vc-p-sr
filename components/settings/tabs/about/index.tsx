/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { React, useState } from "@webpack/common";

const PLUGIN_VERSION = "1.0.0";

const DESCRIPTION =
    "SolRadar monitors Discord channels for private Roblox server links and — if configured — " +
    "joins them the moment they're detected.";

const QUICK_STEPS = [
    {
        step: 1,
        title: "Import or create your triggers",
        detail: "Check out the support server for a file with the triggers you'll need, or create your own triggers."
    },
    {
        step: 2,
        title: "Enable the triggers you want",
        detail: "Also remember to enable either join or notification on each trigger or they won't do anything!"
    },
    {
        step: 3,
        title: "Enable join or notifications on settings",
        detail: "Right-click the plugin icon to toggle on/off"
    },
    {
        step: 4,
        title: "Sit back and wait for snipes",
        detail: "You did it! Now sit back and wait for snipes to happen."
    }
];

interface CreditEntry {
    name: string;
    role: string;
    note?: string;
    url?: string;
}

const CREDITS: CreditEntry[] = [
    {
        name: "masutty",
        role: "(Author)",
        note: "oh hey thats me",
        url: "https://gitlab.com/masutty"
    },
    {
        name: "maxstellar",
        role: "(Credits)",
        note: "Biome icons (uploaded to imgur)",
        url: "https://github.com/maxstellar"
    },
    {
        name: "vexthecoder",
        role: "(Credits)",
        note: "Merchant icons (uploaded to imgur)",
        url: "https://github.com/vexsyx"
    },
    {
        name: "cresqnt-sys",
        role: "(Credits)",
        note: "Biome Detection logic",
        url: "https://github.com/cresqnt-sys/MultiScope-V1/blob/94f1f06114a3e7cbff64e5fd0bf31ced99b0af79/detection.py"
    },
    {
        name: "Vencord",
        role: "(Framework)",
        note: "This plugin wouldn't exist without it!",
        url: "https://vencord.dev"
    }
];

const LINKS = [
    { label: "Source Code (plugin)", url: "https://gitlab.com/masutty/solradar" },
    { label: "Source Code (installer)", url: "https://gitlab.com/masutty/solradar-installer" },
    { label: "Support Server", url: "https://discord.gg/EfWHGGz7MG" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode; }) {
    return (
        <span
            style={{
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: "700"
            }}
        >
            {children}
        </span>
    );
}

function LinkButton({ label, url }: { label: string; url: string; }) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{
                fontSize: "0.8rem",
                color: "var(--text-link)",
                textDecoration: "none",
                padding: "0.2rem 0.65rem",
                borderRadius: "4px",
                border: "1px solid var(--background-modifier-accent)",
                background: "transparent",
                cursor: "pointer",
                transition: "background 0.12s ease"
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--background-modifier-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
            {label}
        </a>
    );
}

// ─── Quick Setup ──────────────────────────────────────────────────────────────

function QuickSetup() {
    const [open, setOpen] = useState(false);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    width: "fit-content"
                }}
            >
                <span
                    style={{
                        fontSize: "0.6rem",
                        color: "var(--text-muted)",
                        display: "inline-block",
                        transition: "transform 0.15s ease",
                        transform: open ? "rotate(90deg)" : "rotate(0deg)",
                        lineHeight: 1
                    }}
                >
                    ▶
                </span>
                <SectionLabel>Quick Setup</SectionLabel>
            </button>

            {open && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                        paddingLeft: "0.2rem"
                    }}
                >
                    {QUICK_STEPS.map(({ step, title, detail }) => (
                        <div
                            key={step}
                            style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}
                        >
                            <span
                                style={{
                                    minWidth: "1.35rem",
                                    height: "1.35rem",
                                    borderRadius: "50%",
                                    background: "var(--background-modifier-accent)",
                                    color: "var(--text-muted)",
                                    fontSize: "0.68rem",
                                    fontWeight: "700",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    marginTop: "0.1rem"
                                }}
                            >
                                {step}
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                                <span style={{ fontSize: "0.85rem", color: "var(--text-default)", fontWeight: "600" }}>
                                    {title}
                                </span>
                                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: "1.45" }}>
                                    {detail}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Credit Card ──────────────────────────────────────────────────────────────

function CreditCard({ entry }: { entry: CreditEntry; }) {
    const inner = (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.45rem" }}>
                <span style={{ fontWeight: "600", color: "var(--text-default)", fontSize: "0.9rem" }}>
                    {entry.name}
                </span>
                <span
                    style={{
                        fontSize: "0.65rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: "600"
                    }}
                >
                    {entry.role}
                </span>
            </div>
            {entry.note && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {entry.note}
                </span>
            )}
        </div>
    );

    const wrapStyle: React.CSSProperties = {
        flex: "1 1 175px",
        minWidth: "150px",
        textDecoration: "none",
        display: "block",
        transition: "opacity 0.15s ease"
    };

    if (entry.url) {
        return (
            <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                style={wrapStyle}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
                <Card variant="normal" defaultPadding>{inner}</Card>
            </a>
        );
    }

    return (
        <div style={wrapStyle}>
            <Card variant="normal" defaultPadding>{inner}</Card>
        </div>
    );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function AboutTab() {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.1rem",
                width: "100%",
                maxWidth: "100%",
                padding: "1.25rem",
                boxSizing: "border-box"
            }}
        >
            {/* Identity */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span
                        style={{
                            fontSize: "1.1rem",
                            fontWeight: "700",
                            color: "var(--text-default)",
                            letterSpacing: "-0.01em"
                        }}
                    >
                        SolRadar
                    </span>
                    <span
                        style={{
                            fontSize: "0.68rem",
                            color: "var(--text-muted)",
                            background: "var(--background-modifier-accent)",
                            padding: "0.1rem 0.45rem",
                            borderRadius: "999px",
                            fontWeight: "600",
                            letterSpacing: "0.04em"
                        }}
                    >
                        v{PLUGIN_VERSION}
                    </span>
                </div>
                <p
                    style={{
                        fontSize: "0.875rem",
                        color: "var(--text-muted)",
                        lineHeight: "1.55",
                        margin: 0,
                        maxWidth: "560px"
                    }}
                >
                    {DESCRIPTION}
                </p>
            </div>

            <Divider />

            {/* Quick Setup */}
            <QuickSetup />

            <Divider />

            {/* Credits */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <SectionLabel>Credits</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {CREDITS.map(entry => (
                        <CreditCard key={entry.name} entry={entry} />
                    ))}
                </div>
            </div>

            {/* Footer Links */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {LINKS.map(l => <LinkButton key={l.label} {...l} />)}
            </div>
            {/* <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", margin: 0, opacity: 0.55 }}>
                Licensed under AGPL-3.0-or-later. Not affiliated with Discord Inc. or Roblox Corporation.
            </p> */}
        </div>
    );
}
