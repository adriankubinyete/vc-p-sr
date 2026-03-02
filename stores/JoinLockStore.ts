/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

// @TODO: this is not a store. move to services

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface JoinLock {
    /** Prioridade do trigger que ativou o lock (número menor = mais importante). */
    priority: number;
    /** Timestamp (ms) em que o lock expira. */
    lockedUntil: number;
    /** Nome do trigger que ativou, apenas para exibição. */
    triggerName: string;
    /** Duração original configurada (segundos), apenas para exibição. */
    durationSeconds: number;
}

type Listener = (lock: JoinLock | null) => void;

// ─── Store ────────────────────────────────────────────────────────────────────

class JoinLockManager {
    private _lock: JoinLock | null = null;
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _listeners = new Set<Listener>();

    // ── Leitura ──────────────────────────────────────────────────────────────

    get current(): JoinLock | null {
        // Limpa expirados lazily ao ler
        if (this._lock && Date.now() >= this._lock.lockedUntil) {
            this._clearInternal();
        }
        return this._lock;
    }

    get isLocked(): boolean {
        return this.current !== null;
    }

    /**
     * Retorna true se o trigger com a prioridade dada está bloqueado pelo lock atual.
     * Prioridade menor = mais importante → passa pelo lock.
     */
    isBlocked(triggerPriority: number): boolean {
        const lock = this.current;
        if (!lock) return false;
        // Bloqueado apenas se o trigger é MENOS importante (número maior)
        return triggerPriority >= lock.priority;
    }

    msRemaining(): number {
        if (!this._lock) return 0;
        return Math.max(0, this._lock.lockedUntil - Date.now());
    }

    // ── Mutações ─────────────────────────────────────────────────────────────

    /**
     * Ativa ou substitui o lock.
     * Só substitui se o novo trigger for mais importante (prioridade menor).
     * Retorna true se o lock foi ativado/atualizado.
     */
    activate(priority: number, durationSeconds: number, triggerName: string): boolean {
        const existing = this.current;

        // Só substitui se o novo for mais importante ou não há lock
        if (existing && priority >= existing.priority) return false;

        this._setLock({
            priority,
            lockedUntil: Date.now() + durationSeconds * 1000,
            triggerName,
            durationSeconds,
        });
        return true;
    }

    /**
     * Remove o lock imediatamente (força manual ou join invalidado).
     */
    release(): void {
        if (!this._lock) return;
        this._clearInternal();
        this._notify();
    }

    // ── Internos ─────────────────────────────────────────────────────────────

    private _setLock(lock: JoinLock): void {
        if (this._timer !== null) clearTimeout(this._timer);
        this._lock = lock;
        this._timer = setTimeout(() => {
            this._clearInternal();
            this._notify();
        }, lock.lockedUntil - Date.now());
        this._notify();
    }

    private _clearInternal(): void {
        if (this._timer !== null) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._lock = null;
    }

    // ── Observers ────────────────────────────────────────────────────────────

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private _notify(): void {
        const snap = this._lock;
        this._listeners.forEach(fn => {
            try { fn(snap); } catch (e) { console.error("[JoinLockStore] Listener error:", e); }
        });
    }
}

export const JoinLockStore = new JoinLockManager();

// ─── Hook React ───────────────────────────────────────────────────────────────

/** Hook que reage a mudanças no join lock. */
export function useJoinLock(): JoinLock | null {
    const [lock, setLock] = React.useState<JoinLock | null>(JoinLockStore.current);

    React.useEffect(() => {
        // Atualiza imediatamente ao montar (pode ter expirado entre renders)
        setLock(JoinLockStore.current);
        return JoinLockStore.subscribe(setLock);
    }, []);

    return lock;
}
