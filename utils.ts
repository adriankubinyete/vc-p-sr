/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { PluginNative } from "@utils/types";
export const cl = classNameFactory("vc-sora-");

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("./native")>;

/** CSV "123,456,789" → Set<string> */
export function parseCsv(csv: string | undefined): Set<string> {
    if (!csv?.trim()) return new Set();
    return new Set(csv.split(",").map(s => s.trim()).filter(Boolean));
}

export async function sendWebhook(url: string, body: string): Promise<void> {
    return await Native.sendWebhook(url, body);
}
