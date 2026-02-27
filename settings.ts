/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    pluginIconLocation: {
        type: OptionType.SELECT,
        description: "Where to place the menu button",
        options: [
            { label: "Chat Bar (default)", value: "chatbar", default: true },
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
    flattenEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Whether to merge embeds into the message content when checking for triggers. If you're monitoring a Macro server, you might want to enable this.",
        default: true
    },
    hideInactiveIndicator: {
        type: OptionType.BOOLEAN,
        description: "Whether to hide the red 'inactive' dot when shortcut action is disabled.",
        default: true,
        hidden: true
    }
});
