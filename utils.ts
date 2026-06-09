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
import { ChangelogEntry, ChangelogVersion, VersionManifest } from "./types";
import versionManifest from "./version.json";
export const cl = classNameFactory("vc-sora-");

export const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("./native")>;
const logger = new Logger("SolRadar");

const LOCAL_VERSION = versionManifest as VersionManifest;
export const PLUGIN_VERSION: string = LOCAL_VERSION.currentVersion;
export const PLUGIN_CHANGELOG: ChangelogVersion[] = LOCAL_VERSION.changelog;

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
export function getCurrentVersion(): string {
    return LOCAL_VERSION.currentVersion;
}

export function getCurrentChangelog(): ChangelogVersion[] {
    return LOCAL_VERSION.changelog;
}

export async function getLatestPublishedManifest(): Promise<VersionManifest | null> {
    const VERSION_URL = "https://gitlab.com/api/v4/projects/80066436/repository/files/version.json/raw?ref=main";

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

        return await response.json() as VersionManifest;
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

export function getLatestKnownVersion(): string | null {
    return settings.store.lastKnownPublishedVersion ?? null;
}

export function getLatestKnownChangelog(): ChangelogEntry[] {
    try {
        return JSON.parse(
            settings.store.lastKnownPublishedChangelog || "[]"
        ) as ChangelogEntry[];
    } catch {
        return [];
    }
}

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

export function getCurrentVersionEntries(): ChangelogEntry[] {
    return (
        LOCAL_VERSION.changelog.find(
            x => x.version === LOCAL_VERSION.currentVersion
        )?.entries ?? []
    );
}

export async function checkForUpdates(): Promise<void> {
    const manifest = await getLatestPublishedManifest();

    if (!manifest) {
        logger.debug("Failed to fetch latest version.");
        return;
    }

    const latestRelease = manifest.changelog.find(
        release => release.version === manifest.currentVersion
    );

    logger.debug(`Latest version: ${manifest.currentVersion}`);
    logger.debug(`Current version: ${getCurrentVersion()}`);

    settings.store.lastKnownPublishedVersion = manifest.currentVersion;
    settings.store.lastKnownPublishedChangelog = JSON.stringify(latestRelease?.entries ?? []);
    settings.store.lastVersionCheck = Date.now();

    if (!isVersionNewer(getCurrentVersion(), manifest.currentVersion)) {
        logger.debug("Plugin is already up to date.");
        return;
    }

    logger.warn(
        `A new version of SolRadar is available: ${manifest.currentVersion} (current: ${getCurrentVersion()})`
    );

    showNotification({
        title: "SoRa :: Update Available!",
        body: `A new version of SolRadar is available: ${manifest.currentVersion} (current: ${getCurrentVersion()})`
    });
}

export async function ensureDailyVersionCheck(): Promise<void> {
    if (!settings.store.shouldCheckForUpdates) {
        logger.debug("Update checks are disabled.");
        return;
    }

    const UPDATE_CHECK_DELAY = 24 * 60 * 60 * 1000;
    const lastCheck = settings.store.lastVersionCheck ?? 0;

    if (Date.now() - lastCheck < UPDATE_CHECK_DELAY) return;

    logger.debug("Checking for updates...");
    await checkForUpdates();
}
