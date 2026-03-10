/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";
import { React } from "@webpack/common";

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "solsRadar_snipeHistory";
const MAX_ENTRIES = 50;

// ─── Tags ─────────────────────────────────────────────────────────────────────

export type SnipeTag =
    | "biome-verified-real" // biome confirmado pelo detector
    | "biome-verified-bait" // biome detectado ≠ esperado
    | "biome-verified-timeout" // detector não respondeu a tempo
    | "biome-not-verified" // detecção desativada
    | "link-verified-safe" // link resolveu para o jogo correto
    | "link-verified-unsafe" // link é bait (jogo diferente)
    | "link-not-verified" // verificação desativada
    | "redundant-biome-ignored" // ignorado devido a redundancia
    | "redundant-biome-bypassed" // redundante, mas bateu no bypass keyword
    | "failed" // openUri falhou
    | "unknown"; // estado inicial

export interface SnipeTagConfig {
    label: string;
    emoji?: string;
    detail?: string;
    /** Maior = mais importante. Usado para eleger a tag primária no card. */
    priority: number;
}

export const TAG_CONFIGS: Record<SnipeTag, SnipeTagConfig> = {
    "biome-verified-real": { emoji: "✅", label: "Biome", detail: "Biome was verified", priority: 70 },
    "biome-verified-bait": { emoji: "❌", label: "Biome", detail: "Biome was verified", priority: 70 },
    "biome-verified-timeout": { emoji: "⏳", label: "Biome", detail: "Biome check timed out", priority: 50 },
    "biome-not-verified": { emoji: "⚠️", label: "Biome", detail: "Biome was not verified", priority: 20 },
    "link-verified-safe": { emoji: "✅", label: "Link", detail: "Link was verified, is allowed", priority: 60 },
    "link-verified-unsafe": { emoji: "❌", label: "Link", detail: "Link was verified, is not allowed", priority: 65 },
    "link-not-verified": { emoji: "⚠️", label: "Link", detail: "Link was not verified", priority: 20 },
    "redundant-biome-ignored": { emoji: "❌", label: "Ignored", detail: "This snipe was ignored due to biome redundancy", priority: 0 },
    "redundant-biome-bypassed": { emoji: "➡️", label: "Bypassed", detail: "This biome was redundant, but a fresh-bypass keyword was detected.", priority: 0 },
    "failed": { emoji: "❌", label: "Join", detail: "Something went wrong trying to join this.", priority: 80 },
    "unknown": { emoji: "❔", label: "Unknown", detail: "Placeholder tag. This should not appear.", priority: 10 },
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SnipeMetrics {
    timeToJoinMs: number;
    joinDurationMs: number;
    overheadMs: number;
}

export interface SnipeEntry {
    id: number;
    timestamp: number;

    // Trigger que disparou o snipe
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
    processedMessageText?: string;

    // Status (adicionados progressivamente)
    tags: SnipeTag[];

    // Performance
    metrics?: SnipeMetrics;

    // URI para rejoin via UI ou notificação clicável
    joinUri?: string;
    // link do servidor privado
    link?: string;
}

export type NewSnipeData = Omit<SnipeEntry, "id" | "timestamp" | "tags"> & {
    tags?: SnipeTag[];
};

type Listener = (entries: SnipeEntry[]) => void;

// ─── Store ────────────────────────────────────────────────────────────────────

class SnipeHistoryStore {
    private _entries: SnipeEntry[] = [];
    private _listeners = new Set<Listener>();

    constructor() {
        this._load();
    }

    // ── Leitura ──────────────────────────────────────────────────────────────

    get all(): SnipeEntry[] {
        return [...this._entries];
    }

    get count(): number {
        return this._entries.length;
    }

    getById(id: number): SnipeEntry | undefined {
        return this._entries.find(e => e.id === id);
    }

    getRecent(limit = 10): SnipeEntry[] {
        return this._entries.slice(0, limit);
    }

    getPrimaryTag(entry: SnipeEntry): SnipeTag {
        if (!entry.tags.length) return "unknown";
        return entry.tags.reduce((best, tag) =>
            (TAG_CONFIGS[tag]?.priority ?? 0) > (TAG_CONFIGS[best]?.priority ?? 0) ? tag : best
        );
    }

    // ── Mutações ─────────────────────────────────────────────────────────────

    add(data: NewSnipeData): number {
        const entry: SnipeEntry = {
            ...data,
            id: Date.now(),
            timestamp: Date.now(),
            tags: data.tags ?? [],
        };

        this._entries.unshift(entry);
        if (this._entries.length > MAX_ENTRIES) {
            this._entries.length = MAX_ENTRIES;
        }

        this._commit();
        return entry.id;
    }

    update(
        id: number,
        patch: Partial<Omit<SnipeEntry, "id" | "timestamp">>,
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

    addTags(id: number, ...tags: SnipeTag[]): boolean {
        const entry = this.getById(id);
        if (!entry) return false;

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
        const choices: SnipeTag[][] = [
            ["link-not-verified", "biome-not-verified"],
            ["link-not-verified", "biome-verified-bait"],
            ["link-not-verified", "biome-verified-real"],
            ["link-not-verified", "biome-verified-timeout"],
            ["link-verified-safe", "biome-verified-real"],
            ["link-verified-unsafe"],
            ["unknown"],
            ["failed"],
            [],
        ];

        for (let i = 0; i < count; i++) {
            this.add({
                triggerName: "Fake Snipe",
                triggerType: "fake",
                triggerPriority: 0,
                tags: choices[Math.floor(Math.random() * choices.length)],
                metrics: { timeToJoinMs: 0, joinDurationMs: 0, overheadMs: 0 },
                processedMessageText: "Fake message",
            });
        }
    }

    // ── Observers ────────────────────────────────────────────────────────────

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private _notify(): void {
        const snapshot = this.all;
        this._listeners.forEach(fn => {
            try { fn(snapshot); } catch (e) { console.error("[SnipeStore] Listener error:", e); }
        });
    }

    // ── Persistência ─────────────────────────────────────────────────────────

    private _commit(): void {
        this._notify();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
        } catch (e) {
            console.error("[SnipeStore] Failed to persist:", e);
        }
    }

    private _load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            this._entries = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("[SnipeStore] Failed to load history:", e);
            this._entries = [];
        }
    }
}

export const SnipeStore = new SnipeHistoryStore();

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSnipeHistory(): SnipeEntry[] {
    const [entries, setEntries] = React.useState<SnipeEntry[]>(SnipeStore.all);
    React.useEffect(() => SnipeStore.subscribe(setEntries), []);
    return entries;
}
