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

import { exec as execCb } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

// import { LogEntry } from "./Detector";

const exec = promisify(execCb);

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ProcessInfo = {
    pid: number;
    name: string;
    path: string;
};

export type ResolvedShareLink =
    | { ok: true; placeId: string; serverId: string; }
    | { ok: false; status: number; error: string; };

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
        if (!data) {
            return { ok: false, status: resolveRes.status, error: "Invalid JSON in resolve response." };
        }

        // O campo varia entre versões da API do Roblox — tenta as duas formas conhecidas
        const placeId: string | undefined =
            data?.privateServerInviteData?.placeId?.toString() ??
            data?.placeId?.toString();

        const serverId: string | undefined =
            data?.privateServerInviteData?.instanceId ??
            data?.instanceId;

        if (!placeId || !serverId) {
            return { ok: false, status: resolveRes.status, error: `Unexpected response shape: ${JSON.stringify(data)}` };
        }

        return { ok: true, placeId, serverId };

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
const LOG_TAIL_READ_BYTES = 2 * 1024 * 1024; // 2 MB
const LOG_READ_SIZE = 1_048_576; // 1 MB
const TIME_THRESHOLD = 7200; // 2h em segundos

// export function getRobloxLogs(_: IpcMainInvokeEvent, from?: "username" | "userid"): LogEntry[] {
//     const now = Date.now() / 1000;
//     let files: string[] = [];

//     try {
//         files = fs.readdirSync(ROBLOX_LOGS_DIR)
//             .filter(f => {
//                 const full = path.join(ROBLOX_LOGS_DIR, f);
//                 if (!fs.statSync(full).isFile()) return false;
//                 return (now - fs.statSync(full).mtime.getTime() / 1000) <= TIME_THRESHOLD;
//             })
//             .sort((a, b) =>
//                 fs.statSync(path.join(ROBLOX_LOGS_DIR, b)).mtime.getTime() -
//                 fs.statSync(path.join(ROBLOX_LOGS_DIR, a)).mtime.getTime()
//             )
//             .map(f => path.join(ROBLOX_LOGS_DIR, f));
//     } catch (err) {
//         console.error("Error listing Roblox logs:", err);
//     }

//     return files.flatMap(logPath => {
//         try {
//             const account = from === "userid"
//                 ? getUseridFromLog(_, logPath)
//                 : getUsernameFromLog(_, logPath);
//             return [{ path: logPath, account, lastModified: fs.statSync(logPath).mtime.getTime() }];
//         } catch {
//             return [];
//         }
//     });
// }

export function getUsernameFromLog(_: IpcMainInvokeEvent, logPath: string): string | null {
    try {
        const match = fs.readFileSync(logPath, "utf8")
            .substring(0, LOG_READ_SIZE)
            .match(/Players\.([^.]+)\.PlayerGui/);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

export function getUseridFromLog(_: IpcMainInvokeEvent, logPath: string): string | null {
    try {
        const match = fs.readFileSync(logPath, "utf8")
            .substring(0, LOG_READ_SIZE)
            .match(/GameJoinLoadTime[\s\S]*?userid:(\d+),/i);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

export function getRelevantRpcsFromLogTail(
    _: IpcMainInvokeEvent,
    logPath: string,
    entireLine = false
): {
    rpcs: string[];
    disconnects: string[];
    effectiveDisconnected: boolean;
    mostRecentRpcTime?: string;
} {
    const empty = { rpcs: [], disconnects: [], effectiveDisconnected: false };
    if (!fs.existsSync(logPath)) return empty;

    try {
        const stats = fs.statSync(logPath);
        const readStart = Math.max(0, stats.size - LOG_TAIL_READ_BYTES);
        const fd = fs.openSync(logPath, "r");
        const buffer = Buffer.alloc(LOG_TAIL_READ_BYTES);
        fs.readSync(fd, buffer, 0, LOG_TAIL_READ_BYTES, readStart);
        fs.closeSync(fd);
        const content = buffer.toString("utf8");

        // Disconnects
        const disconnects: string[] = [];
        const disconnectRe = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z).*Client:Disconnect/g;
        let m: RegExpExecArray | null;
        while ((m = disconnectRe.exec(content))) disconnects.push(m[1]);
        const lastDisconnectMs = disconnects.length
            ? new Date(disconnects[disconnects.length - 1]).getTime()
            : undefined;

        // RPCs (mais recentes primeiro depois do unshift)
        const rpcs: string[] = [];
        let last = content.length;
        while (true) {
            const idx = content.lastIndexOf("[BloxstrapRPC]", last);
            if (idx === -1) break;
            if (entireLine) {
                const start = content.lastIndexOf("\n", idx) + 1;
                const end = content.indexOf("\n", idx);
                rpcs.unshift(content.substring(start, end === -1 ? content.length : end));
            } else {
                const partial = content.substring(idx);
                const endIdx = partial.indexOf("}}}") + 3;
                if (endIdx > 3) rpcs.unshift(partial.substring(0, endIdx));
            }
            last = idx - 1;
        }

        // Timestamp da RPC mais recente
        let mostRecentRpcTime: string | undefined;
        let mostRecentRpcMs: number | undefined;
        if (rpcs.length) {
            const ts = rpcs[rpcs.length - 1].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            if (ts) { mostRecentRpcTime = ts[1]; mostRecentRpcMs = new Date(ts[1]).getTime(); }
        }

        const effectiveDisconnected = lastDisconnectMs !== undefined
            && (mostRecentRpcMs === undefined || mostRecentRpcMs <= lastDisconnectMs);

        return { rpcs, disconnects, effectiveDisconnected, mostRecentRpcTime };
    } catch (err) {
        console.error(`Error reading RPCs from ${logPath}:`, err);
        return empty;
    }
}

export function getBiomeFromRpc(_: IpcMainInvokeEvent, rpcMessage: string): string | null {
    try {
        const jsonStart = rpcMessage.indexOf("{");
        if (jsonStart === -1) return null;
        const data = JSON.parse(rpcMessage.substring(jsonStart));
        const hover = data?.data?.largeImage?.hoverText;
        return typeof hover === "string" ? hover : null;
    } catch {
        return null;
    }
}

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

