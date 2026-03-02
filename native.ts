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
import { exec as execCb } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

// import { LogEntry } from "./Detector";

const logger = new Logger("SolRadar.Native");

const exec = promisify(execCb);

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ProcessInfo = {
    pid: number;
    name: string;
    path: string;
};

export type ResolvedShareLink =
    | { ok: true; placeId: string; serverId: string; ownerId: string; isValid: boolean; }
    | { ok: false; status: number; error: string; };

/** Entrada de log do Roblox — definida aqui pra evitar import circular com BiomeDetector. */
export interface LogEntry {
    path: string;
    account: string | null;
    lastModified: number;
}


// ─── Roblox: abrir URI ────────────────────────────────────────────────────────

/**
 * Abre uma URI via `start ""` no Windows.
 * Usado para deeplinks do tipo `roblox://` e `roblox-player://`.
 */
export async function openUri(_: IpcMainInvokeEvent, uri: string): Promise<void> {
    if (process.platform !== "win32") {
        throw new Error("openUri only works on Windows.");
    }
    if (!uri || typeof uri !== "string") {
        throw new Error("Invalid argument: uri must be a non-empty string.");
    }

    try {
        await exec(`start "" "${uri}"`);
    } catch (error) {
        throw new Error(`Failed to open URI "${uri}": ${(error as Error).message}`);
    }
}

// ─── Roblox: resolver sharelink ───────────────────────────────────────────────

/**
 * Resolve um share code do Roblox para placeId + serverId em um único passo.
 *
 * Internamente:
 *  1. Faz um POST sem body para obter o CSRF token (cookie já traz a resposta 403)
 *  2. Usa o CSRF para fazer o POST real de resolução
 *
 * Retorna ResolvedShareLink com ok=true e os IDs, ou ok=false com o motivo.
 */
export async function resolveShareLink(
    _: IpcMainInvokeEvent,
    token: string,
    shareCode: string
): Promise<ResolvedShareLink> {
    const RESOLVE_URL = "https://apis.roblox.com/sharelinks/v1/resolve-link";
    const headers = (csrf?: string) => ({
        "Cookie": `.ROBLOSECURITY=${token}`,
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-TOKEN": csrf } : {}),
    });

    try {
        // Passo 1 — obtém CSRF (o endpoint sempre retorna 403 na primeira chamada sem CSRF)
        const csrfRes = await fetch(RESOLVE_URL, {
            method: "POST",
            headers: headers(),
        });

        const csrf = csrfRes.headers.get("x-csrf-token");
        if (!csrf) {
            return { ok: false, status: csrfRes.status, error: "CSRF token not returned by server." };
        }

        // Passo 2 — resolução real
        const resolveRes = await fetch(RESOLVE_URL, {
            method: "POST",
            headers: headers(csrf),
            body: JSON.stringify({ linkId: shareCode, linkType: "Server" }),
        });

        if (!resolveRes.ok) {
            return { ok: false, status: resolveRes.status, error: `Resolve request failed with HTTP ${resolveRes.status}.` };
        }

        const data = await resolveRes.json().catch(() => null);
        if (!data || typeof data !== "object") {
            return { ok: false, status: resolveRes.status, error: "Invalid JSON in resolve response." };
        }

        // O campo varia entre versões da API do Roblox — tenta as duas formas conhecidas
        const placeId: string | undefined =
            data?.privateServerInviteData?.placeId?.toString() ??
            data?.placeId?.toString();
        logger.debug(`[${shareCode}] Place ID: ${placeId}`);

        const serverId: string | undefined =
            data?.privateServerInviteData?.instanceId ??
            data?.instanceId ??
            data?.privateServerInviteData?.privateServerId;
        logger.debug(`[${shareCode}] Server ID: ${serverId}`);

        const ownerId: string | undefined = data?.privateServerInviteData?.ownerUserId?.toString();
        logger.debug(`[${shareCode}] Owner ID: ${ownerId}`);

        const isValid: boolean | undefined = data?.privateServerInviteData?.status === "Valid";
        logger.debug(`[${shareCode}] Valid: ${isValid}`);

        if (!placeId || !serverId || !ownerId || !isValid) {
            return { ok: false, status: resolveRes.status, error: `placeId: ${placeId}, serverId: ${serverId}, ownerId: ${ownerId}, isValid: ${isValid} | Unexpected response shape: ${JSON.stringify(data)}` };
        }

        return { ok: true, placeId, serverId, ownerId, isValid };

    } catch (error) {
        return { ok: false, status: -1, error: (error as Error).message };
    }
}

// ─── Processos ────────────────────────────────────────────────────────────────

type ProcessLookupTarget =
    | { type: "tasklist"; processName: string; }
    | { type: "wmic"; processName: string; };

export async function getProcess(
    _: IpcMainInvokeEvent,
    target: ProcessLookupTarget
): Promise<ProcessInfo[]> {
    if (process.platform !== "win32") {
        throw new Error("getProcess only works on Windows.");
    }

    const { type, processName } = target;
    if (!processName || typeof processName !== "string") {
        throw new Error("Invalid argument: processName must be a non-empty string.");
    }

    if (type === "tasklist") {
        const { stdout } = await exec(
            `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`
        );
        return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
            const [name, pid] = line.split(/","/).map(s => s.replace(/"/g, "").trim());
            return { pid: Number(pid), name, path: "" };
        });
    }

    if (type === "wmic") {
        const { stdout } = await exec(
            `wmic process where "name='${processName}'" get ProcessId,ExecutablePath /FORMAT:CSV`
        );
        return stdout.trim().split(/\r?\n/).slice(2).flatMap(line => {
            if (!line.trim()) return [];
            const parts = line.split(",");
            const pid = Number(parts[2]);
            if (!pid) return [];
            return [{ pid, name: processName, path: parts[1] ?? "" }];
        });
    }

    throw new Error(`Unknown process lookup type: ${type}`);
}

export async function killProcess(
    _: IpcMainInvokeEvent,
    target: { pid: number; } | { pname: string; }
): Promise<void> {
    if (process.platform !== "win32") return;

    const command = "pid" in target
        ? `taskkill /PID ${target.pid} /F`
        : `taskkill /IM "${target.pname}" /F`;

    try {
        await exec(command);
    } catch {
        // silencioso — o processo pode já ter encerrado
    }
}

// ─── Biome detection ──────────────────────────────────────────────────────────
// As funções abaixo são responsabilidade do Detector.ts mas ficam aqui
// pois requerem acesso ao Node/fs (native context).

const ROBLOX_LOGS_DIR = path.join(os.homedir(), "AppData", "Local", "Roblox", "logs");
const LOG_TAIL_READ_BYTES = 2 * 1024 * 1024; // 2 MB — tail lido por tick
const LOG_HEAD_READ_BYTES = 1 * 1024 * 1024; // 1 MB — head lido pra extrair userid/username
const LOG_MAX_AGE_S = 7_200; // 2h — logs mais velhos são ignorados

/**
 * Lista logs do Roblox recentes e extrai o account (userid ou username) de cada um.
 * Usa uma única chamada a `fs.statSync` por arquivo (cache local) em vez de três.
 */
export function getRobloxLogs(_: IpcMainInvokeEvent, from: "username" | "userid"): LogEntry[] {
    const nowMs = Date.now();

    let entries: { file: string; mtime: number; }[] = [];

    try {
        entries = fs.readdirSync(ROBLOX_LOGS_DIR).flatMap(f => {
            const full = path.join(ROBLOX_LOGS_DIR, f);
            try {
                const stat = fs.statSync(full);
                if (!stat.isFile()) return [];
                const ageS = (nowMs - stat.mtime.getTime()) / 1000;
                if (ageS > LOG_MAX_AGE_S) return [];
                return [{ file: full, mtime: stat.mtime.getTime() }];
            } catch {
                return [];
            }
        });
    } catch (err) {
        console.error("[SolRadar.Native] Error listing Roblox logs:", err);
        return [];
    }

    // Sort newest first
    entries.sort((a, b) => b.mtime - a.mtime);

    return entries.flatMap(({ file, mtime }) => {
        try {
            const account = from === "userid"
                ? _getUseridFromLog(file)
                : _getUsernameFromLog(file);
            return [{ path: file, account, lastModified: mtime }];
        } catch {
            return [];
        }
    });
}

/** @internal — só chamado pelo getRobloxLogs, não exposto como IPC handler. */
function _getUsernameFromLog(logPath: string): string | null {
    try {
        const head = _readHead(logPath);
        return head.match(/Players\.([^.]+)\.PlayerGui/)?.[1] ?? null;
    } catch { return null; }
}

/** @internal */
function _getUseridFromLog(logPath: string): string | null {
    try {
        const head = _readHead(logPath);
        return head.match(/GameJoinLoadTime[\s\S]*?userid:(\d+),/i)?.[1] ?? null;
    } catch { return null; }
}

/** Lê os primeiros LOG_HEAD_READ_BYTES do arquivo como UTF-8. */
function _readHead(logPath: string): string {
    const fd = fs.openSync(logPath, "r");
    const buffer = Buffer.alloc(LOG_HEAD_READ_BYTES);
    const read = fs.readSync(fd, buffer, 0, LOG_HEAD_READ_BYTES, 0);
    fs.closeSync(fd);
    return buffer.slice(0, read).toString("utf8");
}

/**
 * Lê o tail do log e extrai RPCs de bioma e eventos de desconexão.
 *
 * Retorna:
 * - `rpcs`                — linhas completas de BloxstrapRPC, da mais antiga à mais nova
 * - `disconnects`         — timestamps de Client:Disconnect encontrados no tail
 * - `effectiveDisconnected` — true se o disconnect mais recente é posterior à RPC mais recente
 */
export function getRelevantRpcsFromLogTail(
    _: IpcMainInvokeEvent,
    logPath: string,
): {
    rpcs: string[];
    disconnects: string[];
    effectiveDisconnected: boolean;
} {
    const empty = { rpcs: [], disconnects: [], effectiveDisconnected: false };
    if (!fs.existsSync(logPath)) return empty;

    try {
        const { size } = fs.statSync(logPath);
        const readFrom = Math.max(0, size - LOG_TAIL_READ_BYTES);
        const fd = fs.openSync(logPath, "r");
        const buffer = Buffer.alloc(LOG_TAIL_READ_BYTES);
        const bytesRead = fs.readSync(fd, buffer, 0, LOG_TAIL_READ_BYTES, readFrom);
        fs.closeSync(fd);
        const content = buffer.slice(0, bytesRead).toString("utf8");

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

        return { rpcs, disconnects, effectiveDisconnected };
    } catch (err) {
        console.error(`[SolRadar.Native] Error reading log tail ${logPath}:`, err);
        return empty;
    }
}

// ─── Roblox API ───────────────────────────────────────────────────────────────

/**
 * Converte uma lista de usernames do Roblox em userids via API pública.
 * Usernames não encontrados ficam como null no resultado.
 */
export async function robloxUsernamesToUserIds(
    _: IpcMainInvokeEvent,
    usernames: string[]
): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = Object.fromEntries(usernames.map(n => [n, null]));
    if (!usernames.length) return result;

    try {
        const res = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames, excludeBannedUsers: false }),
        });
        const data = await res.json().catch(() => ({ data: [] }));
        for (const entry of (data.data ?? [])) {
            if (entry?.requestedUsername) result[entry.requestedUsername] = entry.id ?? null;
        }
    } catch { /* silencioso */ }

    return result;
}
