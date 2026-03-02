/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
    fromUser: string[]; // empty = ignore check
    inChannel: string[]; // empty = ignore check
    bypassMatchAmbiguity: boolean; // bypass the "multiple matches" check
    bypassMonitoredOnly: boolean; // bypass the "only in monitored channels" check
    bypassIgnoredGuilds: boolean; // bypass the "ignore this guild" check
    bypassIgnoredChannels: boolean; // bypass the "ignore this channel" check
    bypassLinkVerification: boolean; // bypass the Place ID check
}

export interface TriggerBiome {
    detectionEnabled: boolean;
    detectionKeyword: string;
    skipRedundantJoin: boolean;
}

export interface Trigger {
    id: string;
    type: TriggerType;
    name: string;
    description: string;
    iconUrl: string;
    state: TriggerState;
    conditions: TriggerConditions;
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
    fromUser: [],
    inChannel: [],
    bypassMatchAmbiguity: false,
    bypassMonitoredOnly: false,
    bypassIgnoredGuilds: false,
    bypassIgnoredChannels: false,
    bypassLinkVerification: false,
};

export const DEFAULT_BIOME: TriggerBiome = {
    detectionEnabled: true,
    detectionKeyword: "",
    skipRedundantJoin: true,
};

export function makeDefaultTrigger(type: TriggerType = "BIOME"): Omit<Trigger, "id"> {
    const base: Omit<Trigger, "id"> = {
        type,
        name: "",
        description: "",
        iconUrl: "",
        state: { ...DEFAULT_TRIGGER_STATE },
        conditions: { ...DEFAULT_CONDITIONS },
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
            fromUser: raw.conditions?.fromUser ?? [],
            inChannel: raw.conditions?.inChannel ?? [],
            bypassMatchAmbiguity: raw.conditions?.bypassMatchAmbiguity ?? false,
            bypassMonitoredOnly: raw.conditions?.bypassMonitoredOnly ?? false,
            bypassIgnoredGuilds: raw.conditions?.bypassIgnoredGuilds ?? false,
            bypassIgnoredChannels: raw.conditions?.bypassIgnoredChannels ?? false,
            bypassLinkVerification: raw.conditions?.bypassLinkVerification ?? false,
        },
        state: {
            enabled: raw.state?.enabled ?? DEFAULT_TRIGGER_STATE.enabled,
            autojoin: raw.state?.autojoin ?? DEFAULT_TRIGGER_STATE.autojoin,
            notify: raw.state?.notify ?? DEFAULT_TRIGGER_STATE.notify,
            joinlock: raw.state?.joinlock ?? DEFAULT_TRIGGER_STATE.joinlock,
            joinlockDuration: raw.state?.joinlockDuration ?? DEFAULT_TRIGGER_STATE.joinlockDuration,
            priority: raw.state?.priority ?? DEFAULT_TRIGGER_STATE.priority,
        },
    };
}

// ─── Store interno ────────────────────────────────────────────────────────────

let _triggers: Trigger[] = [];
const _listeners = new Set<() => void>();

function notifyListeners() {
    _listeners.forEach(fn => fn());
}

// ─── Init ─────────────────────────────────────────────────────────────────────

let _initialized = false;

export async function initTriggerStore(): Promise<void> {
    logger.info("Initializing TriggerStore...");
    if (_initialized) return;
    _initialized = true;

    const stored = await DataStore.get<any[]>(DATASTORE_KEY);
    logger.debug("Stored triggers:", stored);

    if (stored && Array.isArray(stored)) {
        _triggers = stored.map(migrateTrigger);
        logger.info(`Loaded and migrated ${_triggers.length} triggers.`);
        // Persiste versão migrada imediatamente
        await DataStore.set(DATASTORE_KEY, _triggers);
    } else {
        _triggers = [];
        logger.info("No stored triggers found, starting empty.");
    }

    notifyListeners();
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

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function persist() {
    await DataStore.set(DATASTORE_KEY, _triggers);
}

export async function addTrigger(data: Omit<Trigger, "id">): Promise<Trigger> {
    const trigger: Trigger = { id: crypto.randomUUID(), ...data };
    _triggers = [..._triggers, trigger];
    notifyListeners();
    await persist();
    return trigger;
}

export async function updateTrigger(id: string, patch: Partial<Omit<Trigger, "id">>): Promise<void> {
    _triggers = _triggers.map(t => t.id === id ? { ...t, ...patch } : t);
    notifyListeners();
    await persist();
}

export async function deleteTrigger(id: string): Promise<void> {
    _triggers = _triggers.filter(t => t.id !== id);
    notifyListeners();
    await persist();
}

export async function toggleTrigger(id: string): Promise<void> {
    _triggers = _triggers.map(t =>
        t.id === id ? { ...t, state: { ...t.state, enabled: !t.state.enabled } } : t
    );
    notifyListeners();
    await persist();
}

/** Salva nova ordem após drag & drop */
export async function reorderTriggers(ordered: Trigger[]): Promise<void> {
    _triggers = ordered;
    notifyListeners();
    await persist();
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export function exportTriggersJson(): string {
    return JSON.stringify(_triggers, null, 2);
}

export function downloadTriggersJson(): void {
    const blob = new Blob([exportTriggersJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solsradar-triggers-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export type ImportResult =
    | { ok: true; imported: number; }
    | { ok: false; error: string; };

export async function importTriggersFromJson(json: string, mode: "merge" | "replace" = "merge"): Promise<ImportResult> {
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

    // Migra também os importados — garante que campos novos sejam preenchidos
    const incoming: Trigger[] = valid.map(t => migrateTrigger({ ...t, id: crypto.randomUUID() }));

    _triggers = mode === "replace" ? incoming : [..._triggers, ...incoming];
    notifyListeners();
    await persist();
    return { ok: true, imported: incoming.length };
}

// ─── Hook React ───────────────────────────────────────────────────────────────

export function useTriggers(): Trigger[] {
    const [triggers, setTriggers] = React.useState<Trigger[]>(_triggers);

    React.useEffect(() => {
        setTriggers(_triggers);
        const update = () => setTriggers([..._triggers]);
        _listeners.add(update);
        return () => { _listeners.delete(update); };
    }, []);

    return triggers;
}

initTriggerStore();
