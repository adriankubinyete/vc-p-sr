/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { React } from "@webpack/common";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TriggerType = "BIOME" | "RARE_BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";

export interface TriggerState {
    enabled: boolean;
    autojoin: boolean;
    notify: boolean;
    joinlock: boolean;
    joinlock_duration: number; // seconds
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
}

export interface TriggerBiome {
    detection_enabled: boolean;
    detection_keyword: string;
}

export interface Trigger {
    id: string;
    type: TriggerType;
    name: string;
    description: string;
    icon_url: string;
    state: TriggerState;
    conditions: TriggerConditions;
    biome?: TriggerBiome; // only for BIOME / RARE_BIOME
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DATASTORE_KEY = "SolsRadar_Triggers";

export const DEFAULT_TRIGGER_STATE: TriggerState = {
    enabled: true,
    autojoin: true,
    notify: true,
    joinlock: true,
    joinlock_duration: 720,
};

export const DEFAULT_CONDITIONS: TriggerConditions = {
    keywords: {
        match: { strict: false, value: [] },
        exclude: { strict: false, value: [] },
    },
    fromUser: [],
    inChannel: [],
};

export const DEFAULT_BIOME: TriggerBiome = {
    detection_enabled: true,
    detection_keyword: "",
};

export function makeDefaultTrigger(type: TriggerType = "CUSTOM"): Omit<Trigger, "id"> {
    const base: Omit<Trigger, "id"> = {
        type,
        name: "",
        description: "",
        icon_url: "",
        state: { ...DEFAULT_TRIGGER_STATE },
        conditions: {
            keywords: {
                match: { strict: false, value: [] },
                exclude: { strict: false, value: [] },
            },
            fromUser: [],
            inChannel: [],
        },
    };

    if (type === "BIOME" || type === "RARE_BIOME") {
        base.biome = { ...DEFAULT_BIOME };
    }

    return base;
}

// ─── Store interno (em memória, sincronizado com DataStore) ───────────────────

let _triggers: Trigger[] = [];
const _listeners = new Set<() => void>();

function notify() {
    _listeners.forEach(fn => fn());
}

// ─── Init ─────────────────────────────────────────────────────────────────────

let _initialized = false;

export async function initTriggerStore(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    const stored = await DataStore.get<Trigger[]>(DATASTORE_KEY);
    _triggers = stored ?? [];
    notify();
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export function getTriggers(): Trigger[] {
    return _triggers;
}

export function getTriggerById(id: string): Trigger | undefined {
    return _triggers.find(t => t.id === id);
}

/** Apenas triggers com enabled: true — usado no runtime */
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
    notify();
    await persist();
    return trigger;
}

export async function updateTrigger(id: string, patch: Partial<Omit<Trigger, "id">>): Promise<void> {
    _triggers = _triggers.map(t => t.id === id ? { ...t, ...patch } : t);
    notify();
    await persist();
}

export async function deleteTrigger(id: string): Promise<void> {
    _triggers = _triggers.filter(t => t.id !== id);
    notify();
    await persist();
}

/** Toggle rápido de enabled — usado direto no card */
export async function toggleTrigger(id: string): Promise<void> {
    _triggers = _triggers.map(t =>
        t.id === id ? { ...t, state: { ...t.state, enabled: !t.state.enabled } } : t
    );
    notify();
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

    // Validação mínima de shape
    const valid = (parsed as any[]).filter(t =>
        t && typeof t === "object" &&
        typeof t.name === "string" &&
        typeof t.type === "string" &&
        t.state && t.conditions
    );

    if (valid.length === 0) {
        return { ok: false, error: "No valid triggers found in the file." };
    }

    // Garante IDs únicos nos importados
    const incoming: Trigger[] = valid.map(t => ({
        ...t,
        id: crypto.randomUUID(),
    }));

    if (mode === "replace") {
        _triggers = incoming;
    } else {
        _triggers = [..._triggers, ...incoming];
    }

    notify();
    await persist();
    return { ok: true, imported: incoming.length };
}

// ─── Hook React ───────────────────────────────────────────────────────────────

export function useTriggers(): Trigger[] {
    const [triggers, setTriggers] = React.useState<Trigger[]>(_triggers);

    React.useEffect(() => {
        // Sync caso o store já tenha sido populado antes do mount
        setTriggers(_triggers);

        const update = () => setTriggers([..._triggers]);
        _listeners.add(update);
        return () => { _listeners.delete(update); };
    }, []);

    return triggers;
}
