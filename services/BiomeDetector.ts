/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * This file contains logic derived from or inspired by the project cresqnt-sys/MultiScope.
 * Portions of the biome detection logic may include translations, adaptations,
 * reinterpretations, or reimplementations of the original Python implementation.
 *
 * Original commit hash: 94f1f06114a3e7cbff64e5fd0bf31ced99b0af79 (AGPL-3.0-or-later)
 * Source File referenced: 94f1f06114a3e7cbff64e5fd0bf31ced99b0af79/detection.py
 *
 * This derivative work is distributed under the terms of the
 * GNU Affero General Public License version 3 (AGPL-3.0).
 */

import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";

const Native = VencordNative.pluginHelpers.SRadar as PluginNative<typeof import("../native")>;
const logger = new Logger("SolRadar.BiomeDetector");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BiomeSnapshot {
    username: string;
    /** null = desconectado ou stale (>60s sem update) */
    biome: string | null;
    lastUpdatedAt: number;
}

export type BiomeVerdict =
    | { result: "real"; biome: string; }
    | { result: "bait"; biome: string; }
    | { result: "timeout"; };

interface AccountState {
    userid: string;
    username: string;
    logPath: string | null;
    lastKnownBiome: string | undefined;
    lastSeenRpcTs: string | undefined;
    lastBiomeUpdatedAt: number;
}

const STALE_THRESHOLD_MS = 60_000;

/** Extrai o nome do bioma de uma linha de BloxstrapRPC. Pure function — sem I/O. */
function _parseBiomeFromRpc(rpcLine: string): string | null {
    try {
        const jsonStart = rpcLine.indexOf("{");
        if (jsonStart === -1) return null;
        const data = JSON.parse(rpcLine.substring(jsonStart));
        const hover = data?.data?.largeImage?.hoverText;
        return typeof hover === "string" ? hover : null;
    } catch {
        return null;
    }
}

// ─── BiomeDetectorService ─────────────────────────────────────────────────────

class BiomeDetectorService {
    private _running = false;
    private _loop?: ReturnType<typeof setInterval>;
    private _accounts: Map<string, AccountState> = new Map(); // userid → state

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async configure(usernames: string[]): Promise<void> {
        if (!usernames.length) return;

        logger.info(`Configuring accounts: ${usernames.join(", ")}`);
        const mapping = await Native.robloxUsernamesToUserIds(usernames);

        this._accounts.clear();
        for (const [username, userid] of Object.entries(mapping)) {
            if (userid === null) {
                logger.warn(`Could not resolve userid for "${username}" — skipping.`);
                continue;
            }
            this._accounts.set(String(userid), {
                userid: String(userid),
                username,
                logPath: null,
                lastKnownBiome: undefined,
                lastSeenRpcTs: undefined,
                lastBiomeUpdatedAt: 0,
            });
        }

        logger.info(`Configured ${this._accounts.size} account(s).`);
    }

    start(intervalMs = 1_000): void {
        if (this._running) return;
        this._running = true;
        this._tick();
        this._loop = setInterval(() => this._tick(), intervalMs);
        logger.info(`Detection loop started (interval: ${intervalMs}ms).`);
    }

    stop(): void {
        this._running = false;
        if (this._loop) clearInterval(this._loop);
        this._loop = undefined;
        logger.info("Detection loop stopped.");
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    getBiome(username: string): BiomeSnapshot | null {
        const state = this._findByUsername(username);
        if (!state) return null;

        const isStale = state.lastBiomeUpdatedAt > 0
            && (Date.now() - state.lastBiomeUpdatedAt) > STALE_THRESHOLD_MS;

        return {
            username,
            biome: (state.lastKnownBiome && !isStale) ? state.lastKnownBiome : null,
            lastUpdatedAt: state.lastBiomeUpdatedAt,
        };
    }

    isAnyAccountInBiome(biomeName: string): boolean {
        const target = biomeName.toLowerCase();
        for (const state of this._accounts.values()) {
            const snap = this.getBiome(state.username);
            if (snap?.biome?.toLowerCase() === target) return true;
        }
        return false;
    }

    /**
     * Aguarda detecção de bioma em duas fases:
     *
     * Fase 1 — espera o logPath mudar (Roblox reiniciou, novo arquivo de log).
     *           Isso garante que nenhuma RPC do jogo anterior é lida.
     *
     * Fase 2 — lê RPCs do novo log até encontrar um bioma.
     *           Compara com o esperado e resolve "real", "bait" ou "timeout".
     *
     * @param expectedBiome - Nome do bioma esperado (case-insensitive)
     * @param timeoutMs     - Timeout total em ms (padrão: 30s)
     */
    waitForBiome(
        expectedBiome: string,
        timeoutMs = 30_000,
        startDelayMs = 0,
    ): { promise: Promise<BiomeVerdict>; cancel: () => void; } {
        const expected = expectedBiome.toLowerCase();
        let resolved = false;
        let intervalId: ReturnType<typeof setInterval>;
        let timerId: ReturnType<typeof setTimeout>;
        let delayId: ReturnType<typeof setTimeout>;
        let resolveFn!: (v: BiomeVerdict) => void;

        const logPathsAtJoin = new Map<string, string | null>(
            Array.from(this._accounts.entries()).map(([id, s]) => [id, s.logPath])
        );

        const cleanup = () => {
            clearInterval(intervalId);
            clearTimeout(timerId);
            clearTimeout(delayId);
        };

        const startPolling = () => {
            intervalId = setInterval(() => {
                if (resolved) return;

                for (const state of this._accounts.values()) {
                    const previousPath = logPathsAtJoin.get(state.userid);
                    if (state.logPath === previousPath) continue;

                    const snap = this.getBiome(state.username);
                    if (!snap?.biome) continue;

                    const detected = snap.biome.toLowerCase();
                    resolved = true;
                    cleanup();

                    if (detected === expected) {
                        resolveFn({ result: "real", biome: snap.biome });
                    } else {
                        logger.warn(`Expected "${expected}", got "${detected}" — bait.`);
                        resolveFn({ result: "bait", biome: snap.biome });
                    }
                    return;
                }
            }, 500);
        };

        const promise = new Promise<BiomeVerdict>(resolve => {
            resolveFn = resolve;

            if (startDelayMs > 0) {
                logger.debug(`waitForBiome: waiting ${startDelayMs}ms before polling.`);
                delayId = setTimeout(startPolling, startDelayMs);
            } else {
                startPolling();
            }

            timerId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve({ result: "timeout" });
            }, timeoutMs);
        });

        const cancel = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolveFn({ result: "timeout" });
        };

        return { promise, cancel };
    }

    // ── Internal tick ─────────────────────────────────────────────────────────

    private async _tick(): Promise<void> {
        if (!this._running || !this._accounts.size) return;
        try {
            await this._syncLogPaths();
            await this._checkAllBiomes();
        } catch (err) {
            logger.error("Tick error:", err);
        }
    }

    private async _syncLogPaths(): Promise<void> {
        const logs = await Native.getRobloxLogs("userid");
        if (!logs.length) return;

        const newest: Record<string, { path: string; mtime: number; }> = {};
        for (const entry of logs) {
            if (!entry.account) continue;
            const cur = newest[entry.account];
            if (!cur || entry.lastModified > cur.mtime) {
                newest[entry.account] = { path: entry.path, mtime: entry.lastModified };
            }
        }

        for (const [userid, state] of this._accounts) {
            const found = newest[userid];
            if (found && found.path !== state.logPath) {
                logger.debug(`Log path for ${state.username} updated: ${found.path}`);
                state.logPath = found.path;
                // Novo arquivo = novo jogo: limpa estado do jogo anterior
                state.lastKnownBiome = undefined;
                state.lastSeenRpcTs = undefined;
                state.lastBiomeUpdatedAt = 0;
            }
        }
    }

    private async _checkAllBiomes(): Promise<void> {
        for (const state of this._accounts.values()) {
            await this._checkSingleAccount(state);
        }
    }

    private async _checkSingleAccount(state: AccountState): Promise<void> {
        if (!state.logPath) return;

        const { rpcs, effectiveDisconnected } =
            await Native.getRelevantRpcsFromLogTail(state.logPath);

        if (effectiveDisconnected) {
            if (state.lastKnownBiome !== undefined) {
                logger.info(`${state.username} disconnected — clearing biome.`);
                state.lastKnownBiome = undefined;
                state.lastBiomeUpdatedAt = Date.now();
            }
            return;
        }

        if (!rpcs.length) return;

        const mostRecentRpc = rpcs[rpcs.length - 1];
        const ts = mostRecentRpc.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)?.[1];
        if (!ts || state.lastSeenRpcTs === ts) return;
        state.lastSeenRpcTs = ts;

        const biome = _parseBiomeFromRpc(mostRecentRpc);
        if (!biome) return;

        if (state.lastKnownBiome !== biome) {
            logger.info(`${state.username}: biome "${state.lastKnownBiome ?? "none"}" → "${biome}"`);
        }

        state.lastKnownBiome = biome;
        state.lastBiomeUpdatedAt = Date.now();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _findByUsername(username: string): AccountState | undefined {
        for (const state of this._accounts.values()) {
            if (state.username === username) return state;
        }
        return undefined;
    }
}

export const BiomeDetector = new BiomeDetectorService();
