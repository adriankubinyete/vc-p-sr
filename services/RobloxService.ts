/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import type { RunningGame } from "@vencord/discord-types";
import { RunningGameStore } from "@webpack/common";

import { settings } from "../settings";
import { SnipableLink } from "../types";
import { BiomeDetector } from "./BiomeDetector";
import { getSnipableLink } from "./MessageProcessor";

const logger = new Logger("SolRadar.RobloxService");

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../native")>;

// ─── Join URI ─────────────────────────────────────────────────────────────────
// Ambos os tipos de link viram deeplinks diretos — sem chamada à API do Roblox.
//
// Share link  (/share?code=...)             → roblox://navigation/share_links?code=...&type=Server
// Private link (/games/{id}?privateSer...) → roblox://experiences/start?placeId={id}&linkCode=...
//
// Referência: https://devforum.roblox.com/t/parsing-deeplink-information-from-a-private-server-link-with-the-newer-format/3464724

export function buildJoinUri(link: SnipableLink | string): string {
    if (typeof link === "string") {
        const resolved = getSnipableLink(link);
        if (!resolved) throw new Error(`Invalid Roblox link: ${link}`);
        link = resolved;
    }

    if (link.type === "share") {
        return `roblox://navigation/share_links?code=${link.code}&type=Server`;
    } else if (link.type === "joinguard") {
        return link.link;
    }
    return `roblox://experiences/start?placeId=${link.placeId}&linkCode=${link.code}`;
}

// ─── Processo do Roblox via RunningGameStore ──────────────────────────────────
// O Discord já rastreia processos em execução via RunningGameStore —
// sem precisar de powershell, wmic ou chamadas nativas.

const ROBLOX_EXE = "robloxplayerbeta.exe"; // exeName é sempre lowercase no store

/**
 * Returns the Roblox process from the RunningGameStore, or null if it's not running.
 *
 * !! This is unreliable: if Discord restarts and the Roblox process is still running,
 * it will not be detected unless navigated to. Also, on close, the process takes
 * a few seconds to disappear from the RunningGameStore.
 *
 * For that reason, this CANNOT be trusted for "closeGameIfNeeded": if this
 * is not updated in time OR the Roblox process is not running, the join could fail.
 *
 * It could be used for quick checks, but shouldn't be used for anything important.
 */
export function getRobloxProcess(): RunningGame | null {
    const games: RunningGame[] = RunningGameStore.getRunningGames() ?? [];
    logger.debug("Running games:", games);
    // @ts-ignore shut the #### up?
    return games.find(g => g.exeName === ROBLOX_EXE) ?? null;
}

/**
 * Retorna true se o Roblox estiver em execução no momento.
 */
export function isRobloxRunning(): boolean {
    return getRobloxProcess() !== null;
}

export async function getPlaceId(link: SnipableLink): Promise<number | null> {
    if (link.type === "private") {
        return Number(link.placeId);
    }

    if (link.type === "share") {
        const res = await Native.resolveShareLink(settings.store.robloxToken, link.code);
        if (res.ok) {
            if (res.updatedToken) {
                logger.info("Roblox rotated the .ROBLOSECURITY token, updating token in settings...");
                settings.store.robloxToken = res.updatedToken;
                logger.debug("Token successfully updated.");
            }
            logger.debug(`Share link resolved: placeId=${res.placeId}, serverId=${res.serverId}, ownerId=${res.ownerId}`);
            return Number(res.placeId);
        }
        logger.warn("Failed to resolve share link:", res);
    }

    return null;
}

/**
 * Closes the Roblox process before joining, if the setting is enabled.
 * This can help prevent failed joins, at the cost of slightly increased join time (~100-200ms).
 */
export async function closeGameIfNeeded(): Promise<boolean | null> {
    if (settings.store.joinMode !== "safe") return null;
    return await closeGame();
}

export async function closeGame({ graceful = false } = {}): Promise<boolean> {
    try {
        if (graceful) {
            await Native.gracefullyKillProcess({ pname: "RobloxPlayerBeta.exe" });
            logger.debug("Closed Roblox process gracefully.");
        } else {
            await Native.killProcess({ pname: "RobloxPlayerBeta.exe" });
            logger.debug("Closed Roblox process.");
        }
        return true;
    } catch (err) {
        logger.warn(`Failed to close Roblox process: ${(err as Error).message}`);
        return false;
    }
}

export async function joinPublicServer(placeId: number): Promise<void> {
    await closeGameIfNeeded();
    return await Native.openUri(`roblox://experiences/start?placeId=${placeId}`);
}

export async function joinSolsPublicServer(): Promise<void> {
    return await joinPublicServer(15532962292);
}

export async function goToHome({ graceful = false } = {}): Promise<boolean> {
    try {
        await closeGame({ graceful: graceful });
        await Native.openUri("roblox://");
        return true;
    } catch (error) {
        return false;
    }
}

export async function joinUri(uri: string | undefined): Promise<void> {
    if (!uri) return;
    await closeGameIfNeeded();
    return await Native.openUri(uri);
}

export async function joinLink(link: SnipableLink | string): Promise<void> {
    await closeGameIfNeeded();
    return await Native.openUri(buildJoinUri(link));
}

export type EmulatorJoinResult =
    | { ok: true; }
    | { ok: false; error: string; };

export async function emulatorJoinUri(uri: string | undefined): Promise<EmulatorJoinResult> {
    if (!uri) return { ok: true };

    const adbResult = await Native.emulatorOpenUri(settings.store.ldpAdbPath, settings.store.ldpAdbDeviceSerial, uri);
    if (!adbResult.ok) {
        const error = adbResult.error || "Unknown error";
        logger.error("Failed to launch Roblox on emulator via adb:", error);
        return { ok: false, error };
    }

    return { ok: true };
}

export async function emulatorJoinLink(link: SnipableLink | string): Promise<EmulatorJoinResult> {
    return emulatorJoinUri(buildJoinUri(link));
}

// the adb join method needs a specific scenario to work:
// on main, be on homepage
// on emulator, be on your private server (so you dont stop rolling)
// this function basically automates that
export type PrepareAdbResult =
    | { ok: true; }
    | { ok: false; error: string; };

export async function prepareAdb(data?: string): Promise<{ ok: true; } | { ok: false; error: string; }> {
    try {
        if (!settings.store.ldpAdbPath) {
            return { ok: false, error: "No adb.exe path set." };
        }

        if (!settings.store.ldpAdbDeviceSerial) {
            return { ok: false, error: "No adb.exe device serial set." };
        }

        const uri = data == null
            ? "roblox://experiences/start?placeId=15532962292"
            : data.startsWith("roblox://")
                ? data
                : buildJoinUri(data);

        await goToHome({ graceful: false });
        const adbResult = await Native.emulatorOpenUri(settings.store.ldpAdbPath, settings.store.ldpAdbDeviceSerial, uri);

        if (!adbResult.ok) {
            const error = adbResult.error === "Exit code 1" ? "LDPlayer might be closed" : adbResult.error || "Unknown error";
            if (!settings.store.omitAdbErrorNotifications) {
                showNotification({
                    title: "SoRa :: ⚠️ Failed to launch Roblox on emulator via adb",
                    body: error,
                });
            }
            logger.error("Failed to launch Roblox on emulator via adb:", adbResult.error);
            return { ok: false, error };
        }

        return { ok: true };
    } catch (error) {
        logger.error("Failed to prepare ADB:", error);
        return { ok: false, error: String(error) };
    }
}

export async function joinOwnPrivateServer(): Promise<void> {
    const link = settings.store.privateServerLink?.trim();
    if (!link) {
        logger.error("Private server link is not set. Cannot join own private server.");
        return;
    }

    try {
        await joinLink(link);
    } catch (error) {
        logger.error("Failed to join own private server:", error);
    }
}

// testing stuff below here, clean it up for next update, currently only on dev page

const NORMAL_BIOME = "EGGLAND";

export interface RejoinUntilBiomeHandle {
    cancel(): void;
}

export async function rejoinUntilBiome(
    targetBiome: string,
    onFinish?: () => void
): Promise<RejoinUntilBiomeHandle> {
    const target = targetBiome.toUpperCase();
    let cancelled = false;
    let currentUnsub: (() => void) | null = null;

    const handle: RejoinUntilBiomeHandle = {
        cancel() {
            logger.info("RejoinUntilBiome cancelled.");
            cancelled = true;
            currentUnsub?.();
            currentUnsub = null;
        }
    };

    function attempt(): void {
        if (cancelled) return;

        logger.info("Attempting to rejoin until biome is", targetBiome);

        currentUnsub = BiomeDetector.on("biomeChanged", ({ to }) => {
            if (cancelled) return;

            const detected = to.toUpperCase();
            logger.info("Detected biome changed to", detected);

            if (detected === NORMAL_BIOME) return;

            currentUnsub?.();
            currentUnsub = null;

            if (detected === target) {
                onFinish?.();
                logger.info("Detected target biome", targetBiome);
            } else {
                joinOwnPrivateServer().then(attempt);
                logger.info("Detected wrong biome, rejoining...");
            }
        });
    }

    attempt();
    return handle;
}
