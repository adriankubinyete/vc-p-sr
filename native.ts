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
import { exec as execCb, spawn } from "child_process";
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
    | { ok: true; placeId: string; serverId: string; ownerId: string; isValid: boolean; updatedToken: string | null; }
    | { ok: false; status: number; error: string; };

// stuff

export async function sendWebhook(_: IpcMainInvokeEvent, url: string, body: string): Promise<void> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
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
        // could be exploited...?
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

    function extractUpdatedToken(response: Response): string | null {
        const setCookies = response.headers.getSetCookie?.() ??
            [response.headers.get("set-cookie")].filter(Boolean) as string[];

        for (const cookie of setCookies) {
            const match = cookie.match(/\.ROBLOSECURITY=([^;]+)/);
            if (match && match[1] !== token) return match[1];
        }
        return null;
    }

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

        const updatedToken = extractUpdatedToken(csrfRes);

        // Passo 2 — resolução real
        const resolveRes = await fetch(RESOLVE_URL, {
            method: "POST",
            headers: headers(csrf),
            body: JSON.stringify({ linkId: shareCode, linkType: "Server" }),
        });

        const updatedTokenFromResolve = extractUpdatedToken(resolveRes);

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

        return { ok: true, placeId, serverId, ownerId, isValid, updatedToken: updatedTokenFromResolve ?? updatedToken ?? null };

    } catch (error) {
        return { ok: false, status: -1, error: (error as Error).message };
    }
}

// ─── Processos ────────────────────────────────────────────────────────────────

type ProcessLookupTarget =
    | { type: "tasklist"; processName: string; }
    | { type: "wmic"; processName: string; }
    | { type: "windowtitle"; windowTitle: string; };

/** Parses `tasklist ... /FO CSV /NH` output (name + pid, no path column). */
function parseTasklistCsv(stdout: string): ProcessInfo[] {
    return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
        const [name, pid] = line.split(/","/).map(s => s.replace(/"/g, "").trim());
        return { pid: Number(pid), name, path: "" };
    });
}

export async function getProcess(
    _: IpcMainInvokeEvent,
    target: ProcessLookupTarget
): Promise<ProcessInfo[]> {
    if (process.platform !== "win32") {
        throw new Error("getProcess only works on Windows.");
    }

    if (target.type === "windowtitle") {
        const { windowTitle } = target;
        if (!windowTitle || typeof windowTitle !== "string") {
            throw new Error("Invalid argument: windowTitle must be a non-empty string.");
        }
        // Matches by top-level window title instead of image name — needed for script-based
        // macros (e.g. AutoHotkey) that all share the same interpreter process name.
        const { stdout } = await exec(
            `tasklist /FI "WINDOWTITLE eq ${windowTitle}" /FO CSV /NH`
        );
        return parseTasklistCsv(stdout);
    }

    const { type, processName } = target;
    if (!processName || typeof processName !== "string") {
        throw new Error("Invalid argument: processName must be a non-empty string.");
    }

    if (type === "tasklist") {
        const { stdout } = await exec(
            `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`
        );
        return parseTasklistCsv(stdout);
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

/** Shared "Windows only" rejection for the ok/error-shaped functions below. */
const WINDOWS_ONLY: { ok: false; error: string; } = { ok: false, error: "Windows only." };

/** Returns an ok:false error if adbPath is missing/invalid, else null. */
function checkAdbPath(adbPath: string): { ok: false; error: string; } | null {
    if (!adbPath || !fs.existsSync(adbPath)) return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    return null;
}

export async function killProcess(
    _: IpcMainInvokeEvent,
    target: { pid: number; } | { pname: string; } | { windowTitle: string; }
): Promise<{ ok: boolean; error?: string; }> {
    if (process.platform !== "win32") return WINDOWS_ONLY;

    const command = "pid" in target
        ? `taskkill /PID ${target.pid} /F`
        : "pname" in target
            ? `taskkill /IM "${target.pname}" /F`
            // No /IM or /PID here — /FI alone selects and kills every process matching the filter.
            : `taskkill /FI "WINDOWTITLE eq ${target.windowTitle}" /F`;

    try {
        await exec(command);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function gracefullyKillProcess(
    _: IpcMainInvokeEvent,
    target: { pid: number } | { pname: string },
    timeoutMs: number = 3000
): Promise<void> {
    if (process.platform !== "win32") return;

    const softCommand = "pid" in target
        ? `taskkill /PID ${target.pid}`
        : `taskkill /IM "${target.pname}"`;

    const hardCommand = "pid" in target
        ? `taskkill /PID ${target.pid} /F`
        : `taskkill /IM "${target.pname}" /F`;

    try {
        await exec(softCommand);
    } catch {
        // Process may already be gone — skip straight to done
        return;
    }

    // Give the process time to exit gracefully
    await new Promise(resolve => setTimeout(resolve, timeoutMs));

    // Check if it's still alive; if so, force-kill
    try {
        const checkCommand = "pid" in target
            ? `tasklist /FI "PID eq ${target.pid}" /NH`
            : `tasklist /FI "IMAGENAME eq ${(target as { pname: string }).pname}" /NH`;

        const { stdout } = await exec(checkCommand);
        const isAlive = stdout.trim().length > 0 && !stdout.includes("No tasks");

        if (isAlive) {
            await exec(hardCommand).catch(() => { /* already dead */ });
        }
    } catch {
        // tasklist failure means the process is gone — nothing to do
    }
}

export async function closeRobloxOnEmulator(
    _: IpcMainInvokeEvent,
    adbPath: string,
    deviceSerial: string,
    packageName: string = "com.roblox.client"
): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32") return WINDOWS_ONLY;

    const adbErr = checkAdbPath(adbPath);
    if (adbErr) return adbErr;

    try {
        // this exec could be exploited... lets hope the user doesnt do anything stupid :clueless:
        await exec(`"${adbPath}" -s ${deviceSerial} shell am force-stop ${packageName}`);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function emulatorOpenUri(
    _: IpcMainInvokeEvent,
    adbPath: string,
    deviceSerial: string,
    uri: string
): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32") return WINDOWS_ONLY;

    const adbErr = checkAdbPath(adbPath);
    if (adbErr) return adbErr;

    try {
        // could be exploited... hope the user doesnt do anything stupid :clueless:
        const proc = spawn(adbPath, [
            "-s", deviceSerial,
            "shell",
            "am", "start",
            "-a", "android.intent.action.VIEW",
            "-d", `'${uri}'`,
            "com.roblox.client"
        ], {
            shell: false
        });

        return await new Promise(resolve => {
            proc.on("exit", code => {
                if (code === 0) resolve({ ok: true });
                else resolve({ ok: false, error: `Exit code ${code}` });
            });

            proc.on("error", err => {
                resolve({ ok: false, error: err.message });
            });
        });

    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function listAdbDevices(
    _: IpcMainInvokeEvent,
    adbPath: string
): Promise<{ ok: true; output: string; } | { ok: false; error: string; }> {
    if (process.platform !== "win32") return WINDOWS_ONLY;
    const adbErr = checkAdbPath(adbPath);
    if (adbErr) return adbErr;
    try {
        const { stdout } = await exec(`"${adbPath}" devices`);
        return { ok: true, output: stdout.trim() };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function killAdbServer(
    _: IpcMainInvokeEvent,
    adbPath: string
): Promise<{ ok: true; } | { ok: false; error: string; }> {
    if (process.platform !== "win32") return WINDOWS_ONLY;
    const adbErr = checkAdbPath(adbPath);
    if (adbErr) return adbErr;
    try {
        await exec(`"${adbPath}" kill-server`);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

// ─── Biome detection ──────────────────────────────────────────────────────────
// As funções abaixo são responsabilidade do Detector.ts mas ficam aqui
// pois requerem acesso ao Node/fs (native context).

const ROBLOX_LOGS_DIR = path.join(os.homedir(), "AppData", "Local", "Roblox", "logs");

// Só primitivas cruas de fs aqui — sem regex, sem cache, sem regra de negócio.
// Todo o parsing/cache de log mora do lado do plugin, em services/RobloxLogReader.ts.

export interface RobloxLogFile {
    path: string;
    mtimeMs: number;
    size: number;
}

/** Lista arquivos do diretório de logs do Roblox, com mtime/size — sem filtrar por idade. */
export async function listRobloxLogFiles(_: IpcMainInvokeEvent): Promise<RobloxLogFile[]> {
    let files: string[];
    try {
        files = await fs.promises.readdir(ROBLOX_LOGS_DIR);
    } catch (err) {
        console.error("[SolRadar.Native] Error listing Roblox logs:", err);
        return [];
    }

    const stats = await Promise.all(files.map(async f => {
        const full = path.join(ROBLOX_LOGS_DIR, f);
        try {
            const stat = await fs.promises.stat(full);
            if (!stat.isFile()) return null;
            return { path: full, mtimeMs: stat.mtimeMs, size: stat.size };
        } catch {
            return null;
        }
    }));

    return stats.filter((s): s is RobloxLogFile => s !== null);
}

/** Stat de um único arquivo, ou null se não existir/inacessível. */
export async function statFile(_: IpcMainInvokeEvent, filePath: string): Promise<{ mtimeMs: number; size: number; } | null> {
    try {
        const stat = await fs.promises.stat(filePath);
        return { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch {
        return null;
    }
}

/** Lê um pedaço bruto de um arquivo como UTF-8, a partir de `position` por até `length` bytes. */
export async function readFileChunk(
    _: IpcMainInvokeEvent,
    filePath: string,
    position: number,
    length: number
): Promise<string> {
    const fd = await fs.promises.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await fd.read(buffer, 0, length, position);
        return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
        await fd.close();
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
