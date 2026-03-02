/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";
import { React } from "@webpack/common";

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "solsRadar_joinHistory";
const MAX_ENTRIES = 50;

// ─── Tags ─────────────────────────────────────────────────────────────────────

export type JoinTag =
    | "biome-verified-real" // biome confirmado pelo detector
    | "biome-verified-bait" // biome detectado ≠ esperado
    | "biome-verified-timeout" // detector não respondeu a tempo
    | "biome-not-verified" // detecção desativada
    | "link-verified-safe" // link resolveu para o jogo correto
    | "link-verified-unsafe" // link é bait (jogo diferente)
    | "link-not-verified" // verificação desativada
    | "failed" // openUri falhou
    | "unknown"; // estado inicial

export interface JoinTagConfig {
    label: string;
    emoji?: string;
    detail?: string;
    /** Maior = mais importante. Usado para eleger a tag primária no card. */
    priority: number;
}

export const TAG_CONFIGS: Record<JoinTag, JoinTagConfig> = {
    "biome-verified-real": { emoji: "✅", label: "Biome", detail: "Biome was verified", priority: 70, },
    "biome-verified-bait": { emoji: "❌", label: "Biome", detail: "Biome was verified", priority: 70, },
    "biome-verified-timeout": { emoji: "⚠️", label: "Biome", detail: "Biome check timed out", priority: 50, },
    "biome-not-verified": { emoji: "⚠️", label: "Biome", detail: "Biome was not verified", priority: 20, },

    "link-verified-safe": { emoji: "✅", label: "Link", detail: "Link was verified, is allowed", priority: 60, },
    "link-verified-unsafe": { emoji: "❌", label: "Link", detail: "Link was verified, is not allowed", priority: 65, },
    "link-not-verified": { emoji: "⚠️", label: "Link", detail: "Link was not verified", priority: 20, },

    "failed": { emoji: "❌", label: "Join", detail: "Something went wrong trying to join this.", priority: 80, },

    "unknown": { emoji: "❔", label: "Unknown", detail: "Placeholder tag. This should not appear.", priority: 10, },
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface JoinMetrics {
    timeToJoinMs: number;
    joinDurationMs: number;
    overheadMs: number;
}

export interface JoinEntry {
    id: number;
    timestamp: number;

    // Trigger que disparou o join
    triggerName: string;
    triggerType: string;
    triggerPriority: number;

    // Servidor
    iconUrl?: string;

    // Mensagem original
    authorName?: string;
    authorAvatarUrl?: string;
    authorId?: string;
    channelName?: string;
    guildName?: string;
    messageJumpUrl?: string;
    originalContent?: string;

    // Status (adicionados progressivamente via addTags)
    tags: JoinTag[];

    // Performance
    metrics?: JoinMetrics;
}

/** Dados necessários para criar uma nova entrada. */
export type NewJoinData = Omit<JoinEntry, "id" | "timestamp" | "tags"> & {
    tags?: JoinTag[];
};

type Listener = (entries: JoinEntry[]) => void;

// ─── Store ────────────────────────────────────────────────────────────────────

class JoinHistoryStore {
    private _entries: JoinEntry[] = [];
    private _listeners = new Set<Listener>();

    constructor() {
        this._load();
    }

    // ── Leitura ──────────────────────────────────────────────────────────────

    get all(): JoinEntry[] {
        return [...this._entries];
    }

    get count(): number {
        return this._entries.length;
    }

    getById(id: number): JoinEntry | undefined {
        return this._entries.find(e => e.id === id);
    }

    getRecent(limit = 10): JoinEntry[] {
        return this._entries.slice(0, limit);
    }

    getPrimaryTag(entry: JoinEntry): JoinTag {
        if (!entry.tags.length) return "unknown";
        return entry.tags.reduce((best, tag) =>
            (TAG_CONFIGS[tag]?.priority ?? 0) > (TAG_CONFIGS[best]?.priority ?? 0) ? tag : best
        );
    }

    // ── Mutações ─────────────────────────────────────────────────────────────

    /**
     * Cria uma nova entrada e retorna seu ID.
     * Chame addTags() posteriormente para atualizar o status progressivamente.
     */
    add(data: NewJoinData): number {
        const entry: JoinEntry = {
            ...data,
            id: Date.now(),
            timestamp: Date.now(),
            tags: data.tags ?? ["unknown"],
        };

        this._entries.unshift(entry);
        if (this._entries.length > MAX_ENTRIES) {
            this._entries.length = MAX_ENTRIES;
        }

        this._commit();
        return entry.id;
    }

    /**
     * Atualiza campos de uma entrada existente.
     * Tags são mescladas por padrão — passe `replaceTags: true` para substituir.
     */
    update(
        id: number,
        patch: Partial<Omit<JoinEntry, "id" | "timestamp">>,
        opts: { replaceTags?: boolean; } = {}
    ): boolean {
        const idx = this._entries.findIndex(e => e.id === id);
        if (idx === -1) return false;

        const current = this._entries[idx];
        const tags = patch.tags
            ? opts.replaceTags
                ? patch.tags
                : [...new Set([...current.tags, ...patch.tags])]
            : current.tags;

        this._entries[idx] = { ...current, ...patch, tags };
        this._commit();
        return true;
    }

    /**
     * Adiciona tags a uma entrada existente, sem duplicar.
     */
    addTags(id: number, ...tags: JoinTag[]): boolean {
        const entry = this.getById(id);
        if (!entry) return false;
        // Remove "unknown" quando uma tag real chega
        const base = tags.some(t => t !== "unknown")
            ? entry.tags.filter(t => t !== "unknown")
            : entry.tags;
        return this.update(id, { tags: [...new Set([...base, ...tags])] }, { replaceTags: true });
    }

    delete(id: number): boolean {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.id !== id);
        if (this._entries.length === before) return false;
        this._commit();
        return true;
    }

    clear(): void {
        this._entries = [];
        this._commit();
    }

    addFakes(count: number): void {
        const choices: JoinTag[][] = [
            ["link-not-verified", "biome-not-verified"],
            ["link-not-verified", "biome-verified-bait"],
            ["link-not-verified", "biome-verified-real"],
            ["link-not-verified", "biome-verified-timeout"],
            ["link-verified-safe", "biome-verified-real"],
            ["link-verified-unsafe"],
            ["unknown"],
            ["failed"],
            [] // this is a broken tag!
        ];

        for (let i = 0; i < count; i++) {
            this.add({
                triggerName: "Fake Join",
                triggerType: "fake",
                triggerPriority: 0,
                tags: choices[Math.floor(Math.random() * choices.length)],
                metrics: { timeToJoinMs: 0, joinDurationMs: 0, overheadMs: 0 },
                originalContent: "Fake message",
            });
        }
    }

    // ── Observers ────────────────────────────────────────────────────────────

    /** Inscreve um listener e retorna a função de unsubscribe. */
    subscribe(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private _notify(): void {
        const snapshot = this.all;
        this._listeners.forEach(fn => {
            try { fn(snapshot); } catch (e) { console.error("[JoinStore] Listener error:", e); }
        });
    }

    // ── Persistência ─────────────────────────────────────────────────────────

    private _commit(): void {
        this._notify();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
        } catch (e) {
            console.error("[JoinStore] Failed to persist:", e);
        }
    }

    private _load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            this._entries = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("[JoinStore] Failed to load history:", e);
            this._entries = [];
        }
    }
}

export const JoinStore = new JoinHistoryStore();

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Hook React que se mantém sincronizado com o JoinStore. */
export function useJoinHistory(): JoinEntry[] {
    const [entries, setEntries] = React.useState<JoinEntry[]>(JoinStore.all);
    React.useEffect(() => JoinStore.subscribe(setEntries), []);
    return entries;
}
