/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    // main ui stuff
    pluginIconLocation: {
        type: OptionType.SELECT,
        description: "Where to place the menu button",
        options: [
            { label: "Chat Bar (default)", value: "chatbar", default: true }, // this is the most stable place
            { label: "Title Bar", value: "titlebar" },
            { label: "Hidden (not recommended)", value: "hide" }
        ],
        restartNeeded: true
    },
    pluginIconShortcutAction: {
        type: OptionType.SELECT,
        description: "What to do when right-clicking the menu button",
        options: [
            { label: "Toggle global auto-join", value: "toggle_join" },
            { label: "Toggle global notifications", value: "toggle_notification" },
            { label: "Toggle both (default)", value: "toggle_both", default: true },
            { label: "Do nothing", value: "none" }
        ]
    },

    // main behavior
    autoJoinEnabled: {
        type: OptionType.BOOLEAN,
        description: "Global auto-join state. Takes precedence over the trigger-specific setting.",
        default: false,
    },
    notificationEnabled: {
        type: OptionType.BOOLEAN,
        description: "Global notification state. Takes precedence over the trigger-specific setting.",
        default: false
    },
    closeGameBeforeJoin: {
        type: OptionType.BOOLEAN,
        description: "Close Roblox before attempting to join a server. Slightly increases join time (~100-200ms) but prevents joins from straight up failing.",
        default: true,
    },

    // others
    flattenEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Whether to merge embeds into the message content when checking for triggers. If you're monitoring a Macro server, you might want to enable this.",
        default: true
    },

    // ui
    hideInactiveIndicator: {
        type: OptionType.BOOLEAN,
        description: "Whether to hide the red 'inactive' dot in menu button when joins are disabled.",
        default: true,
    },

    // monitoring
    monitoredChannels: {
        type: OptionType.STRING,
        description: "Comma-separated list of channel IDs that the plugin should monitor. If empty, no channel will be monitored. Example: `123456789012345678, 987654321098765432`",
        default: "",
    },
    ignoredGuilds: {
        type: OptionType.STRING,
        description: "Comma-separated list of guild IDs that the plugin should ignore. Useful if you want to use the plugin but avoid monitoring a specific guild. Created because of Glitch Hunting servers with a no-snipers policy. Example: `123456789012345678, 987654321098765432`",
        default: "",
    },
    ignoredChannels: {
        type: OptionType.STRING,
        description: "Comma-separated list of channel IDs that the plugin should ignore. Example: `123456789012345678, 987654321098765432`",
        default: "",
    },
    ignoredUsers: {
        type: OptionType.STRING,
        description: "Comma-separated list of user IDs that the plugin should ignore. Example: `123456789012345678, 987654321098765432`",
        default: "",
    },

    // link check
    linkVerification: {
        type: OptionType.SELECT,
        description: "When to verify links. Requires a robloxToken configured to work. If set to after, once a bad link is detected, the plugin will execute the onBadLink action.",
        options: [
            { label: "Disabled", value: "disabled", default: true },
            { label: "Before Joining (slower, safer)", value: "before" },
            { label: "After Joining", value: "after" },
        ]
    },
    robloxToken: {
        type: OptionType.STRING,
        description: "This is NOT required for the plugin to work! Your .ROBLOSECURITY cookie value. Required for link verification. Keep this private and never share it with anyone. Highly recommended to make an alt account just to use it's token for this. The plugin only uses it to verify if a server link is valid by making a request to Roblox's API. It does NOT store or transmit the token in any other way.",
        default: "",
    },
    onBadLink: {
        type: OptionType.SELECT,
        description: "What to do when a bad link is detected. A bad link is a server link that fails verification (e.g. because it's expired or fake).",
        options: [
            { label: "Nothing (not recommended)", value: "nothing" },
            { label: "Join a public server", value: "public", default: true },
            { label: "Close Roblox", value: "close" },
        ]
    },
    allowedPlaceIds: {
        type: OptionType.STRING,
        description: "Comma-separated list of place IDs that are allowed to be joined. If empty, all place IDs are allowed. Example: `123456789012345678, 987654321098765432`",
        default: "",
    },

    // detector
    detectorEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable biome detection. When active, the plugin reads your Roblox log files to verify whether the biome you joined actually matches what was announced. Requires at least one account configured below.",
        default: false,
        restartNeeded: true, // i am NOT gonna hot-reload this
    },
    detectorAccounts: {
        type: OptionType.STRING,
        description: "Comma-separated list of Roblox usernames to monitor for biome detection. If empty, biome detection is disabled.",
        default: "",
        restartNeeded: true, // i am NOT gonna hot-reload this
    },
    detectorTimeoutMs: {
        type: OptionType.NUMBER,
        description: "How long (in milliseconds) to wait for a biome to be detected after joining. If no biome is detected within this window, the join is marked as timed out and the join lock is released. Recommended: 30000",
        default: 30000,
        restartNeeded: true, // i am NOT gonna hot-reload this
    },
    detectorIntervalMs: {
        type: OptionType.NUMBER,
        description: "How often (in milliseconds) the detector reads your Roblox log files. Lower values give faster detection but read the disk more frequently. Recommended: 5000. Advised to keep this above 1000 due to minimal returns.",
        default: 5000,
        restartNeeded: true, // i am NOT gonna hot-reload this
    },
});
