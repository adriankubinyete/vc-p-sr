/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import { AuthenticationStore, showToast as defaultShowToast } from "@webpack/common";

import { settings } from "./settings";
import { PLUGIN_VERSION } from "./version";
export const cl = classNameFactory("vc-sora-");

export const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("./native")>;
const logger = new Logger("SolRadar");

/**
 * Converts a CSV string to a Set of strings
 * @param {string} [csv] CSV string, e.g. "123,456,789"
 * @returns {Set<string>} Set of strings, e.g. Set("123", "456", "789")
 * @throws {TypeError} If the given parameter is not a string or undefined
 */
export function parseCsv(csv?: string): Set<string> {
    if (typeof csv !== "string" && csv !== undefined) throw new TypeError("Expected a string or undefined as the first argument");
    if (!csv?.trim()) return new Set();
    return new Set(csv.split(",").map(s => s.trim()).filter(Boolean));
}

/**
 * Sends a webhook to the specified URL with the given body
 * @param {string} url URL of the webhook
 * @param {string} body Body of the webhook
 * @returns {Promise<void>} Promise that resolves once the webhook has been sent
 * @param url
 */
export async function sendWebhook(url: string, body: string): Promise<void> {
    return await Native.sendWebhook(url, body);
}

/**
 * Converts a duration in milliseconds to a human-readable string.
 *
 * @param {number} ms Duration in milliseconds.
 * @param {boolean} [alwaysIncludeMs=false] If true, includes the remaining
 * milliseconds in the output even when the duration is ≥ 1 second
 * (e.g., "1s 500ms" instead of "1s"). Also includes "0ms" when applicable.
 * @returns {string} Human-readable string, e.g. "2h 3m 4s" or "2h 3m 4s 500ms".
 */
export function formatElapsedTime(ms: number, { alwaysIncludeMs = false }: { alwaysIncludeMs?: boolean; } = {}): string {
    ms = Math.floor(ms);
    if (ms < 1000 && !alwaysIncludeMs) {
        return `${ms}ms`;
    }

    const totalSeconds = Math.floor(ms / 1000);
    const remainingMs = ms % 1000;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];

    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) parts.push(`${seconds}s`);

    if (alwaysIncludeMs) {
        parts.push(`${remainingMs}ms`);
    }

    return parts.join(" ");
}

export function isDeveloper(): boolean {
    const id = AuthenticationStore.getId();
    const SORA_DEVELOPERS = [
        "188851299255713792",
    ];
    return (SORA_DEVELOPERS.includes(id));
}


// returns the userid of the current user
export function whoAmI(): string {
    return "";
}

export function playAudio(dataUri: string, volume: number = 100): void {
    try {
        const audio = new Audio(dataUri);
        audio.volume = Math.max(0, Math.min(1, volume / 100));
        audio.play().catch(err => console.error("[SoRa] Failed to play audio:", err));
    } catch (err) {
        logger.error("Something went wrong while playing audio:", err);

    }
}

// this is insanely stupid
export function showToast(...args: Parameters<typeof defaultShowToast>): void {
    try {
        defaultShowToast(...args);
    } catch (e) {
        logger.error("Failed to show toast", {
            error: e,
            args
        });
    }
}

/**
 * Recursively extracts all URLs from a Discord message component tree.
 *
 * Traverses nested components (such as action rows, buttons, and other
 * container components) and collects every `url` property found.
 *
 * @param {any[]} components Array of Discord message components.
 * @returns {string[]} Array containing all extracted URLs.
 */
export function extractComponentUrls(components: any[]): string[] {
    const urls: string[] = [];

    for (const component of components) {
        if (component.url) {
            urls.push(component.url);
        }

        if (component.components?.length) {
            urls.push(...extractComponentUrls(component.components));
        }
    }

    return urls;
}

export const redact = (min = 6, max = 14) =>
    "█".repeat(Math.floor(Math.random() * (max - min + 1)) + min);


// version control utilitaries

/**
 * Returns the currently installed plugin version.
 *
 * @returns {string} Current plugin version.
 */
export function getCurrentVersion(): string {
    return PLUGIN_VERSION;
}

/**
 * Extracts the plugin version from a version.ts file.
 *
 * @param {string} source Raw file contents.
 * @returns {string | null} Extracted version or null if not found.
 */
function extractVersion(source: string): string | null {
    return source.match(
        /PLUGIN_VERSION\s*=\s*["']([^"']+)["']/
    )?.[1] ?? null;
}

/**
 * Fetches the latest published version from GitLab.
 *
 * @returns {Promise<string | null>} Latest published version or null on failure.
 */
export async function getLatestPublishedVersion(): Promise<string | null> {
    const VERSION_URL = "https://gitlab.com/api/v4/projects/80066436/repository/files/version.ts/raw?ref=main";
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 5000);

    try {
        const response = await fetch(VERSION_URL, {
            signal: controller.signal,
            cache: "no-store"
        });

        if (!response.ok) {
            return null;
        }

        return extractVersion(await response.text());
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Parses a version string into comparable parts.
 *
 * Examples:
 * - 1.2.3
 * - 1.2.3-beta
 * - 0.0.0-batata
 *
 * @param {string} version Version string.
 */
function parseVersion(version: string) {
    const [numeric, suffix = ""] = version.split("-", 2);

    return {
        numbers: numeric.split(".").map(v => Number(v) || 0),
        suffix
    };
}

/**
 * Returns whether the latest version is newer than the current version.
 *
 * Supports version suffixes such as:
 * - 1.0.0-beta
 * - 1.0.0-test
 * - 1.0.0-dev
 *
 * Stable releases are considered newer than pre-releases with the same
 * numeric version.
 *
 * @param {string} current Current installed version.
 * @param {string} latest Latest available version.
 * @returns {boolean} True if an update is available.
 */
export function isVersionNewer(
    current: string,
    latest: string
): boolean {
    const a = parseVersion(current);
    const b = parseVersion(latest);

    const length = Math.max(
        a.numbers.length,
        b.numbers.length
    );

    for (let i = 0; i < length; i++) {
        const currentPart = a.numbers[i] ?? 0;
        const latestPart = b.numbers[i] ?? 0;

        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
    }

    if (a.suffix && !b.suffix) return true;
    if (!a.suffix && b.suffix) return false;

    return b.suffix > a.suffix;
}
/**
 * Returns the last successfully fetched published version.
 *
 * @returns {string | null} Last known published version.
 */
export function getLatestKnownVersion(): string | null {
    return settings.store.lastKnownPublishedVersion || null;
}

/**
 * Returns whether an update is available based on the last successful
 * version check.
 *
 * This function never performs network requests.
 *
 * @returns {boolean} True if an update is available.
 */
export function hasNewVersionAvailable(): boolean {
    const latestVersion = getLatestKnownVersion();

    if (!latestVersion) {
        return false;
    }

    return isVersionNewer(
        getCurrentVersion(),
        latestVersion
    );
}

/**
 * Checks for plugin updates at most once every 24 hours.
 */
export async function ensureDailyVersionCheck() {
    if (!settings.store.shouldCheckForUpdates) {
        logger.debug("Update checks are disabled.");
        return;
    }

    const now = Date.now();
    const lastCheck = settings.store.lastVersionCheck ?? 0;

    logger.debug(`Last update check: ${lastCheck}`);

    const UPDATE_CHECK_DELAY = 24 * 60 * 60 * 1000; // 24 hours

    if (now - lastCheck < UPDATE_CHECK_DELAY) {
        logger.debug(
            `Skipping update check (${Math.floor((now - lastCheck) / 1000)}s since last check).`
        );
        return;
    }

    logger.debug("Checking for updates...");

    const latestVersion = await getLatestPublishedVersion();

    logger.debug(`Latest version: ${latestVersion}`);
    logger.debug(`Current version: ${getCurrentVersion()}`);

    if (!latestVersion) {
        logger.debug("Failed to fetch latest version.");
        return;
    }

    settings.store.lastKnownPublishedVersion = latestVersion;
    settings.store.lastVersionCheck = now;

    logger.debug(`Updated lastVersionCheck to ${now}`);
    logger.debug(`Updated lastKnownPublishedVersion to ${latestVersion}`);

    if (!isVersionNewer(getCurrentVersion(), latestVersion)) {
        logger.debug("Plugin is already up to date.");
        return;
    }

    logger.warn(
        `A new version of SolRadar is available: ${latestVersion} (current: ${getCurrentVersion()})`
    );

    showNotification({
        title: "SoRa :: Update Available!",
        body: `A new version of SolRadar is available: ${latestVersion} (current: ${getCurrentVersion()})`
    });
}
