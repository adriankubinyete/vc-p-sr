/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";

import { JoinTag } from "./JoinStore";

const STORAGE_KEY = "vc-sora-ui-state";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ModalTab = "recentJoins" | "triggers" | "settings" | "dev";
export type TriggerFilter = "all" | "RARE_BIOME" | "EVENT_BIOME" | "BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";
export type JoinFilter = JoinTag | "all";

interface UIState {
    activeTab: ModalTab;
    triggers: { typeFilter: TriggerFilter; search: string; };
    recentJoins: { tagFilter: JoinFilter; search: string; };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: UIState = {
    activeTab: "recentJoins",
    triggers: { typeFilter: "all", search: "" },
    recentJoins: { tagFilter: "all", search: "" },
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
            };
        } catch (e) {
            console.error("[UIStateStore] load failed, using defaults:", e);
            return structuredClone(DEFAULTS);
        }
    }
}

export const UIState = new UIStateStore();
