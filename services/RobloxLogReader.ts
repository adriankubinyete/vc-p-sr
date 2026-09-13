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

import { PluginNative } from "@utils/types";

// Todo o parsing/cache de log do Roblox mora aqui — native.ts só expõe as
// primitivas cruas de fs (listar diretório, stat, ler um pedaço de arquivo).
const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../native")>;

const LOG_TAIL_READ_BYTES = 2 * 1024 * 1024; // 2 MB — tail lido por tick
const LOG_HEAD_READ_BYTES = 1 * 1024 * 1024; // 1 MB — head lido pra extrair userid/username
const LOG_MAX_AGE_S = 7_200; // 2h — logs mais velhos são ignorados

export interface LogEntry {
    path: string;
    account: string | null;
    lastModified: number;
}

export interface LogTailResult {
    rpcs: string[];
    disconnects: string[];
    effectiveDisconnected: boolean;
}

/** account (username/userid) por caminho de log — resolvido uma vez, nunca muda pro mesmo arquivo. */
const logAccountCache = new Map<string, { username: string | null; userid: string | null; }>();

/** último {mtime, size, resultado} de getRelevantRpcsFromLogTail por caminho — pula reler+re-regexar o tail se o arquivo não mudou desde a última checagem. */
const logTailCache = new Map<string, { mtimeMs: number; size: number; result: LogTailResult; }>();

/**
 * Lista logs do Roblox recentes e extrai o account (userid ou username) de cada um.
 */
export async function getRobloxLogs(from: "username" | "userid"): Promise<LogEntry[]> {
    const nowMs = Date.now();
    const files = await Native.listRobloxLogFiles();

    const recent = files
        .filter(f => (nowMs - f.mtimeMs) / 1000 <= LOG_MAX_AGE_S)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return Promise.all(recent.map(async f => {
        const { username, userid } = await resolveLogAccount(f.path);
        const account = from === "userid" ? userid : username;
        return { path: f.path, account, lastModified: f.mtimeMs };
    }));
}

/** Extrai (e cacheia) username + userid do head do log, uma única vez por arquivo. */
async function resolveLogAccount(logPath: string): Promise<{ username: string | null; userid: string | null; }> {
    const cached = logAccountCache.get(logPath);
    if (cached) return cached;

    const head = await Native.readFileChunk(logPath, 0, LOG_HEAD_READ_BYTES).catch(() => "");

    const result = {
        username: head.match(/Players\.([^.]+)\.PlayerGui/)?.[1] ?? null,
        userid: head.match(/GameJoinLoadTime[\s\S]*?userid:(\d+),/i)?.[1] ?? null,
    };
    logAccountCache.set(logPath, result);
    return result;
}

/**
 * Lê o tail do log e extrai RPCs de bioma e eventos de desconexão.
 *
 * Retorna:
 * - `rpcs`                — linhas completas de BloxstrapRPC, da mais antiga à mais nova
 * - `disconnects`         — timestamps de Client:Disconnect encontrados no tail
 * - `effectiveDisconnected` — true se o disconnect mais recente é posterior à RPC mais recente
 */
export async function getRelevantRpcsFromLogTail(logPath: string): Promise<LogTailResult> {
    const empty: LogTailResult = { rpcs: [], disconnects: [], effectiveDisconnected: false };

    const stat = await Native.statFile(logPath);
    if (!stat) return empty;

    const cached = logTailCache.get(logPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.result;
    }

    try {
        const readFrom = Math.max(0, stat.size - LOG_TAIL_READ_BYTES);
        const content = await Native.readFileChunk(logPath, readFrom, LOG_TAIL_READ_BYTES);

        // ── Disconnects ───────────────────────────────────────────────────────
        const disconnects: string[] = [];
        const disconnectRe = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z).*Client:Disconnect/g;
        let m: RegExpExecArray | null;
        while ((m = disconnectRe.exec(content))) disconnects.push(m[1]);
        const lastDisconnectMs = disconnects.length
            ? new Date(disconnects[disconnects.length - 1]).getTime()
            : undefined;

        // ── RPCs — busca reversa pra manter O(tail) em vez de O(file) ────────
        const rpcs: string[] = [];
        let searchFrom = content.length;
        while (true) {
            const idx = content.lastIndexOf("[BloxstrapRPC]", searchFrom);
            if (idx === -1) break;
            const lineStart = content.lastIndexOf("\n", idx) + 1;
            const lineEnd = content.indexOf("\n", idx);
            rpcs.unshift(content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd));
            searchFrom = idx - 1;
        }

        // ── effectiveDisconnected ─────────────────────────────────────────────
        let mostRecentRpcMs: number | undefined;
        if (rpcs.length) {
            const ts = rpcs[rpcs.length - 1].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            if (ts) mostRecentRpcMs = new Date(ts[1]).getTime();
        }

        const effectiveDisconnected = lastDisconnectMs !== undefined
            && (mostRecentRpcMs === undefined || mostRecentRpcMs <= lastDisconnectMs);

        const result: LogTailResult = { rpcs, disconnects, effectiveDisconnected };
        logTailCache.set(logPath, { mtimeMs: stat.mtimeMs, size: stat.size, result });
        return result;
    } catch (err) {
        console.error(`[SolRadar] Error reading log tail ${logPath}:`, err);
        return empty;
    }
}
