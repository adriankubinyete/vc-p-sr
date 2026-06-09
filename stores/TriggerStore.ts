/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* eslint-disable @stylistic/no-multi-spaces */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { React } from "@webpack/common";

const logger = new Logger("SolRadar");

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TriggerType = "RARE_BIOME" | "EVENT_BIOME" | "BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";

export interface TriggerState {
    enabled: boolean;
    autojoin: boolean;
    notify: boolean;
    joinlock: boolean;
    joinlockDuration: number; // seconds
    /**
     * Prioridade do trigger (1 = mais alta, números maiores = menos importante).
     * O join lock bloqueia novos joins, EXCETO de triggers com prioridade
     * MENOR que o trigger que ativou o lock.
     *
     * Exemplo: lock ativado por prioridade 3 → triggers 1 e 2 ainda passam,
     * triggers 4+ são bloqueados.
     */
    priority: number;
    notificationSound?: string; // data URI ("data:audio/mp3;base64,...")
    notificationSoundVolume?: number; // 0-100, default 100
}

export interface KeywordSet {
    strict: boolean;
    value: string[];
}

export interface TriggerConditions {
    keywords: {
        match: KeywordSet;
        exclude: KeywordSet;
    };
    mentionRoles: { id: string; label: string; }[]; // for servers which only pings role instead of saying what biome it is
    fromUser: string[]; // empty = ignore check
    inChannel: string[]; // empty = ignore check
    ignoredChannels: string[]; // trigger-level ignored channels
    ignoredGuilds: string[]; // trigger-level ignored guilds
    bypassMatchAmbiguity: boolean; // bypass the "multiple matches" check
    bypassMonitoredOnly: boolean; // bypass the "only in monitored channels" check
    bypassIgnoredGuilds: boolean; // bypass the global "ignore this guild" check
    bypassForwardIgnoredGuilds: boolean; // bypass the global "ignore this guild" check for forwarding
    bypassIgnoredChannels: boolean; // bypass the global "ignore this channel" check
    bypassLinkVerification: boolean; // bypass the Place ID check
    bypassLinkDeduplication: boolean; // bypass the duplicate link check
}

export interface TriggerBiome {
    detectionEnabled: boolean;
    detectionKeyword: string;
    skipRedundantJoin: boolean;
}

export interface TriggerForwarding {
    webhookUrl: string;
    webhookContent: string;
    webhookEmbedDescription: string;
    excludedGuilds: string[];
    excludedChannels: string[];
    onMatch: {
        enabled: boolean;
        early: boolean;
    };
    onDetection: {
        enabled: boolean;
    };
}

export interface Trigger {
    id: string;
    type: TriggerType;
    name: string;
    description: string;
    iconUrl: string;
    state: TriggerState;
    conditions: TriggerConditions;
    forwarding: TriggerForwarding;
    biome?: TriggerBiome;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DATASTORE_KEY = "SolsRadar_Triggers";

export const DEFAULT_TRIGGER_STATE: TriggerState = {
    enabled: true,
    autojoin: true,
    notify: true,
    joinlock: false,
    joinlockDuration: 0,
    priority: 10,
};

export const DEFAULT_CONDITIONS: TriggerConditions = {
    keywords: {
        match: { strict: false, value: [] },
        exclude: { strict: false, value: [] },
    },
    mentionRoles: [],
    fromUser: [],
    inChannel: [],
    ignoredChannels: [],
    ignoredGuilds: [],
    bypassMatchAmbiguity: false,
    bypassMonitoredOnly: false,
    bypassIgnoredGuilds: false,
    bypassForwardIgnoredGuilds: false,
    bypassIgnoredChannels: false,
    bypassLinkVerification: false,
    bypassLinkDeduplication: false,
};

export const DEFAULT_BIOME: TriggerBiome = {
    detectionEnabled: true,
    detectionKeyword: "",
    skipRedundantJoin: true,
};

export const DEFAULT_FORWARDING: TriggerForwarding = {
    webhookUrl: "",
    webhookContent: "",
    webhookEmbedDescription: "",
    excludedGuilds: [],
    excludedChannels: [],
    onMatch: {
        enabled: false,
        early: false,
    },
    onDetection: {
        enabled: false,
    },
};

export function makeDefaultTrigger(type: TriggerType = "BIOME"): Omit<Trigger, "id"> {
    const base: Omit<Trigger, "id"> = {
        type,
        name: "",
        description: "",
        iconUrl: "",
        state: { ...DEFAULT_TRIGGER_STATE },
        conditions: { ...DEFAULT_CONDITIONS },
        forwarding: { ...DEFAULT_FORWARDING },
    };

    if (type !== "MERCHANT") {
        base.biome = {
            ...DEFAULT_BIOME,
            detectionEnabled: type !== "CUSTOM",
        };
    }

    return base;
}

// ─── Migração suave ───────────────────────────────────────────────────────────
// Chamada em cada trigger ao carregar do DataStore.
// Campos novos recebem defaults se ausentes — dados antigos são preservados.

function migrateTrigger(raw: any): Trigger {
    return {
        id: raw.id ?? crypto.randomUUID(),
        type: raw.type ?? "CUSTOM",
        name: raw.name ?? "",
        description: raw.description ?? "",
        iconUrl: raw.iconUrl ?? "",
        biome: {
            detectionEnabled: raw.biome?.detectionEnabled ?? DEFAULT_BIOME.detectionEnabled,
            detectionKeyword: raw.biome?.detectionKeyword ?? DEFAULT_BIOME.detectionKeyword,
            skipRedundantJoin: raw.biome?.skipRedundantJoin ?? DEFAULT_BIOME.skipRedundantJoin,
        },
        conditions: {
            keywords: {
                match: raw.conditions?.keywords?.match ?? { strict: false, value: [] },
                exclude: raw.conditions?.keywords?.exclude ?? { strict: false, value: [] },
            },
            mentionRoles: raw.conditions?.mentionRoles ?? [],
            fromUser: raw.conditions?.fromUser ?? [],
            inChannel: raw.conditions?.inChannel ?? [],
            ignoredChannels: raw.conditions?.ignoredChannels ?? [],
            ignoredGuilds: raw.conditions?.ignoredGuilds ?? [],
            bypassMatchAmbiguity: raw.conditions?.bypassMatchAmbiguity ?? false,
            bypassMonitoredOnly: raw.conditions?.bypassMonitoredOnly ?? false,
            bypassIgnoredGuilds: raw.conditions?.bypassIgnoredGuilds ?? false,
            bypassForwardIgnoredGuilds: raw.conditions?.bypassForwardIgnoredGuilds ?? false,
            bypassIgnoredChannels: raw.conditions?.bypassIgnoredChannels ?? false,
            bypassLinkVerification: raw.conditions?.bypassLinkVerification ?? false,
            bypassLinkDeduplication: raw.conditions?.bypassLinkDeduplication ?? false,
        },
        state: {
            enabled: raw.state?.enabled ?? DEFAULT_TRIGGER_STATE.enabled,
            autojoin: raw.state?.autojoin ?? DEFAULT_TRIGGER_STATE.autojoin,
            notify: raw.state?.notify ?? DEFAULT_TRIGGER_STATE.notify,
            joinlock: raw.state?.joinlock ?? DEFAULT_TRIGGER_STATE.joinlock,
            joinlockDuration: raw.state?.joinlockDuration ?? DEFAULT_TRIGGER_STATE.joinlockDuration,
            priority: raw.state?.priority ?? DEFAULT_TRIGGER_STATE.priority,
            notificationSound: raw.state?.notificationSound ?? "",
            notificationSoundVolume: raw.state?.notificationSoundVolume ?? 100,
        },
        forwarding: {
            webhookUrl: raw.forwarding?.webhookUrl ?? DEFAULT_FORWARDING.webhookUrl,
            webhookContent: raw.forwarding?.webhookContent ?? DEFAULT_FORWARDING.webhookContent,
            webhookEmbedDescription: raw.forwarding?.webhookEmbedDescription ?? DEFAULT_FORWARDING.webhookEmbedDescription,
            excludedGuilds: raw.forwarding?.excludedGuilds ?? DEFAULT_FORWARDING.excludedGuilds,
            excludedChannels: raw.forwarding?.excludedChannels ?? DEFAULT_FORWARDING.excludedChannels,
            onMatch: {
                enabled: raw.forwarding?.onMatch?.enabled ?? DEFAULT_FORWARDING.onMatch.enabled,
                early: raw.forwarding?.onMatch?.early ?? DEFAULT_FORWARDING.onMatch.early,
            },
            onDetection: {
                enabled: raw.forwarding?.onDetection?.enabled ?? DEFAULT_FORWARDING.onDetection.enabled,
            },
        },
    };
}

// ─── Store interno ────────────────────────────────────────────────────────────

let _triggers: Trigger[] = [];
const _listeners = new Set<() => void>();

function notifyListeners(): void {
    _listeners.forEach(fn => fn());
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// Uma única Promise é criada no carregamento do módulo.
// Qualquer código que precise dos triggers deve fazer `await triggerStoreReady`.
// Chamadas a addTrigger / updateTrigger / etc. também awaitsam antes de mutarem.

let _resolveReady!: () => void;

/**
 * Resolved when the initial IDB load (+ migration) is complete.
 * Await this before reading triggers outside React hooks.
 */
export const triggerStoreReady: Promise<void> = new Promise(res => {
    _resolveReady = res;
});

// ─── Persistência com fila ────────────────────────────────────────────────────
// Writes são serializados: o próximo só começa quando o anterior termina.
// Isso evita que dois DataStore.set concorrentes se sobrescrevam fora de ordem.

let _writeQueue: Promise<void> = Promise.resolve();

function persist(): void {
    _writeQueue = _writeQueue.then(async () => {
        try {
            await DataStore.set(DATASTORE_KEY, _triggers);
        } catch (e) {
            logger.error("Failed to persist triggers:", e);
        }
    });
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export function getTriggers(): Trigger[] {
    return _triggers;
}

export function getTriggerById(id: string): Trigger | undefined {
    return _triggers.find(t => t.id === id);
}

export function getActiveTriggers(): Trigger[] {
    return _triggers.filter(t => t.state.enabled);
}

export function getTriggersWithOnMatchForwarding(): Trigger[] {
    return _triggers.filter(t => t.state.enabled && t.forwarding.onMatch.enabled);
}

export function getTriggersWithOnDetectionForwarding(): Trigger[] {
    return _triggers.filter(t => t.state.enabled && t.forwarding.onDetection.enabled);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
// Todas as mutações aguardam triggerStoreReady para garantir que o init
// terminou antes de qualquer escrita.

export async function addTrigger(data: Omit<Trigger, "id">): Promise<Trigger> {
    await triggerStoreReady;
    const trigger: Trigger = { id: crypto.randomUUID(), ...data };
    _triggers = [..._triggers, trigger];
    notifyListeners();
    persist();
    return trigger;
}

export async function updateTrigger(id: string, patch: Partial<Omit<Trigger, "id">>): Promise<void> {
    await triggerStoreReady;
    _triggers = _triggers.map(t => t.id === id ? { ...t, ...patch } : t);
    notifyListeners();
    persist();
}

export async function deleteTrigger(id: string): Promise<void> {
    await triggerStoreReady;
    _triggers = _triggers.filter(t => t.id !== id);
    notifyListeners();
    persist();
}

export async function toggleTrigger(id: string): Promise<void> {
    await triggerStoreReady;
    _triggers = _triggers.map(t =>
        t.id === id ? { ...t, state: { ...t.state, enabled: !t.state.enabled } } : t
    );
    notifyListeners();
    persist();
}

export async function reorderTriggers(ordered: Trigger[]): Promise<void> {
    await triggerStoreReady;
    _triggers = ordered;
    notifyListeners();
    persist();
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export type RedactField =
    | "enabled"             // desativa o trigger
    | "webhookUrl"          // zera forwarding.webhookUrl
    | "webhookForwarding"   // desativa onMatch/onDetection
    | "webhookPersonal"     // limpa webhookContent, webhookEmbedDescription, excludedGuilds, excludedChannels
    | "notificationSound"   // remove o data URI do state
    | "customTriggers"      // remove triggers do tipo CUSTOM inteiro
    | "conditions"          // zera IDs pessoais: fromUser, inChannel, ignoredChannels, ignoredGuilds, mentionRoles
    | "bypasses";           // reseta todos os flags de bypass para false

export type ExportOptions = {
    redact?: RedactField[];
};

export function exportTriggersJson(): string {
    return JSON.stringify(_triggers, null, 2);
}

export function downloadTriggersJson(): void {
    _downloadJson(exportTriggersJson(), `solsradar-triggers-${Date.now()}.json`);
}

function redactTrigger(trigger: Trigger, redact: Set<RedactField>): Trigger | null {
    if (redact.has("customTriggers") && trigger.type === "CUSTOM") return null;

    return {
        ...trigger,
        conditions: {
            ...trigger.conditions,
            ...(redact.has("conditions") && { fromUser: [], inChannel: [], ignoredChannels: [], ignoredGuilds: [], mentionRoles: [] }),
            ...(redact.has("bypasses") && {
                bypassMatchAmbiguity: false,
                bypassMonitoredOnly: false,
                bypassIgnoredGuilds: false,
                bypassForwardIgnoredGuilds: false,
                bypassIgnoredChannels: false,
                bypassLinkVerification: false,
                bypassLinkDeduplication: false,
            }),
        },
        state: {
            ...trigger.state,
            ...(redact.has("notificationSound") && { notificationSound: "", notificationSoundVolume: 100 }),
            ...(redact.has("enabled") && { enabled: false }),
        },
        forwarding: {
            ...trigger.forwarding,
            ...(redact.has("webhookUrl") && { webhookUrl: "" }),
            ...(redact.has("webhookPersonal") && {
                webhookContent: "",
                webhookEmbedDescription: "",
                excludedGuilds: [],
                excludedChannels: [],
            }),
            onMatch: redact.has("webhookForwarding")
                ? { ...trigger.forwarding.onMatch, enabled: false }
                : trigger.forwarding.onMatch,
            onDetection: redact.has("webhookForwarding")
                ? { ...trigger.forwarding.onDetection, enabled: false }
                : trigger.forwarding.onDetection,
        },
    };
}

export function exportTriggersJsonRedacted(options: ExportOptions = {}): string {
    const redact = new Set(options.redact ?? []);
    const result = _triggers
        .map(t => redactTrigger(t, redact))
        .filter((t): t is Trigger => t !== null);
    return JSON.stringify(result, null, 2);
}

export function downloadTriggersJsonRedacted(options: ExportOptions = {}): void {
    _downloadJson(exportTriggersJsonRedacted(options), `solsradar-triggers-public-${Date.now()}.json`);
}

export function safeExportDraft(draft: Omit<Trigger, "id">): Omit<Trigger, "id"> {
    const redact = new Set<RedactField>(["conditions", "bypasses", "webhookUrl", "webhookForwarding", "webhookPersonal"]);
    const { id: _, ...rest } = redactTrigger({ id: "", ...draft }, redact)!;
    return rest;
}

function _downloadJson(content: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
}

export type ImportResult =
    | { ok: true; imported: number; }
    | { ok: false; error: string; };

export async function importTriggersFromJson(json: string, mode: "merge" | "replace" = "merge"): Promise<ImportResult> {
    await triggerStoreReady;

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, error: "Invalid JSON." };
    }

    if (!Array.isArray(parsed)) {
        return { ok: false, error: "Expected a JSON array of triggers." };
    }

    const valid = (parsed as any[]).filter(t =>
        t && typeof t === "object" &&
        typeof t.name === "string" &&
        typeof t.type === "string" &&
        t.state && t.conditions
    );

    if (valid.length === 0) {
        return { ok: false, error: "No valid triggers found in the file." };
    }

    const incoming = valid.map(t => migrateTrigger({ ...t, id: crypto.randomUUID() }));
    _triggers = mode === "replace" ? incoming : [..._triggers, ...incoming];
    notifyListeners();
    persist();
    return { ok: true, imported: incoming.length };
}

// ─── Hook React ───────────────────────────────────────────────────────────────

export function useTriggers(): Trigger[] {
    const [triggers, setTriggers] = React.useState<Trigger[]>(_triggers);

    React.useEffect(() => {
        // Sync inicial: garante que o estado reflete o IDB após o init async
        triggerStoreReady.then(() => setTriggers([..._triggers]));

        const update = () => setTriggers([..._triggers]);
        _listeners.add(update);
        return () => { _listeners.delete(update); };
    }, []);

    return triggers;
}

// Executa imediatamente ao importar o módulo — não há segunda chamada.
(async () => {
    logger.info("Initializing TriggerStore…");

    try {
        const stored = await DataStore.get<any[]>(DATASTORE_KEY);
        logger.debug("Stored triggers:", stored);

        if (Array.isArray(stored) && stored.length > 0) {
            _triggers = stored.map(migrateTrigger);
            logger.info(`Loaded and migrated ${_triggers.length} triggers.`);
            // Persiste versão migrada imediatamente (novos campos preenchidos).
            await DataStore.set(DATASTORE_KEY, _triggers);
        } else {
            _triggers = [];
            logger.info("No stored triggers found, starting empty.");
        }
    } catch (e) {
        logger.error("Failed to load triggers from DataStore:", e);
        _triggers = [];
    } finally {
        _resolveReady();
        notifyListeners();
    }
})();
