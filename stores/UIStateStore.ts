/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";

import { SnipeTag } from "../types";

const STORAGE_KEY = "vc-sora-ui-state";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ModalTab = "recentJoins" | "triggers" | "settings" | "about" | "dev" | "stats" | "utilities" | "updates" | "testtab2" | "testtab3";
export type TriggerFilter = "all" | "RARE_BIOME" | "EVENT_BIOME" | "BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";
export type JoinFilter = SnipeTag | "all";

/** Dados persistidos de um EditableActionButton. */
export interface EabData {
    /** Label customizado pelo usuário (undefined = usa o defaultLabel do componente) */
    label?: string;
    /** Valor customizado pelo usuário (undefined = usa o defaultValue do componente) */
    value?: string;
}

interface UIState {
    activeTab: ModalTab;
    triggers: { typeFilter: TriggerFilter; search: string; };
    recentJoins: { tagFilter: JoinFilter; search: string; };
    /** Dados persistidos dos EditableActionButtons, indexados por id. */
    eabValues: Record<string, EabData>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: UIState = {
    activeTab: "recentJoins",
    triggers: { typeFilter: "all", search: "" },
    recentJoins: { tagFilter: "all", search: "" },
    eabValues: {},
};

// ─── Store ────────────────────────────────────────────────────────────────────

class UIStateStore {
    private _state: UIState = this._load();

    /** Lê uma chave do estado. */
    get<K extends keyof UIState>(key: K): UIState[K] {
        return this._state[key];
    }

    /**
     * Atualiza uma chave e persiste. Suporta patch parcial em objetos.
     *
     * @example
     * UIState.set("activeTab", "triggers");
     * UIState.set("triggers", { typeFilter: "RARE_BIOME" });
     */
    set<K extends keyof UIState>(
        key: K,
        value: UIState[K] extends object ? Partial<UIState[K]> : UIState[K]
    ): void {
        const current = this._state[key];
        this._state[key] = (
            current !== null && typeof current === "object"
                ? { ...current as object, ...value as object }
                : value
        ) as UIState[K];
        this._save();
    }

    // ─── EAB helpers ──────────────────────────────────────────────────────────

    /** Retorna os dados persistidos de um EAB (label e value). */
    getEab(id: string): EabData {
        return this._state.eabValues[id] ?? {};
    }

    /**
     * Faz patch parcial nos dados de um EAB e persiste.
     * Passar undefined em um campo remove-o (volta ao default do componente).
     *
     * @example
     * UIState.setEab("my-btn", { value: "roblox://..." });
     * UIState.setEab("my-btn", { label: "Launch game" });
     * UIState.setEab("my-btn", { value: undefined }); // reseta só o value
     */
    setEab(id: string, patch: Partial<EabData>): void {
        const current = this._state.eabValues[id] ?? {};
        const next: EabData = { ...current, ...patch };

        // Remove campos undefined para manter o objeto limpo
        if (next.label === undefined) delete next.label;
        if (next.value === undefined) delete next.value;

        // Se ficou vazio, remove a entrada inteira
        if (Object.keys(next).length === 0) {
            const { [id]: _, ...rest } = this._state.eabValues;
            this._state.eabValues = rest;
        } else {
            this._state.eabValues = { ...this._state.eabValues, [id]: next };
        }

        this._save();
    }

    private _save(): void {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); }
        catch (e) { console.error("[UIStateStore] save failed:", e); }
    }

    private _load(): UIState {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return structuredClone(DEFAULTS);
            const saved = JSON.parse(raw) as Partial<UIState>;

            return {
                activeTab: saved.activeTab ?? DEFAULTS.activeTab,
                triggers: { ...DEFAULTS.triggers, ...saved.triggers },
                recentJoins: { ...DEFAULTS.recentJoins, ...saved.recentJoins },
                eabValues: saved.eabValues ?? {},
            };
        } catch (e) {
            console.error("[UIStateStore] load failed, using defaults:", e);
            return structuredClone(DEFAULTS);
        }
    }
}

export const UIState = new UIStateStore();
