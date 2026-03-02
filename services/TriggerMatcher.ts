/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// import { Logger } from "@utils/Logger";
import { Message } from "@vencord/discord-types";

import { KeywordSet, Trigger } from "../stores/TriggerStore";

// const logger = new Logger("SolRadar.TriggerMatcher");

// ─── Helpers de matching ──────────────────────────────────────────────────────

/**
 * Verifica se `text` contém `keyword`.
 * strict=true  → word boundary (\bkeyword\b), case-insensitive
 * strict=false → substring simples, case-insensitive
 */
function containsKeyword(text: string, keyword: string, strict: boolean): boolean {
    if (strict) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }
    return text.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * Avalia um KeywordSet contra o conteúdo da mensagem.
 * matchMode="require" → pelo menos UMA keyword deve estar presente (ou set vazio = passa)
 * matchMode="exclude" → NENHUMA keyword pode estar presente (ou set vazio = passa)
 */
function evaluateKeywordSet(text: string, set: KeywordSet, matchMode: "require" | "exclude"): boolean {
    if (set.value.length === 0) return true;

    const found = set.value.some(kw => containsKeyword(text, kw, set.strict));
    return matchMode === "require" ? found : !found;
}

// ─── Avaliação individual ─────────────────────────────────────────────────────

interface TriggerEvalResult {
    trigger: Trigger;
    matched: boolean;
    reason?: string;
}

function evaluateTrigger(message: Message, trigger: Trigger): TriggerEvalResult {
    const { conditions } = trigger;
    const { content } = message;
    const authorId = message.author.id;
    const channelId = message.channel_id;

    if (conditions.fromUser.length > 0 && !conditions.fromUser.includes(authorId))
        return { trigger, matched: false, reason: `author ${authorId} not in fromUser list` };

    if (conditions.inChannel.length > 0 && !conditions.inChannel.includes(channelId))
        return { trigger, matched: false, reason: `channel ${channelId} not in inChannel list` };

    if (!evaluateKeywordSet(content, conditions.keywords.match, "require"))
        return { trigger, matched: false, reason: `no match keyword found (strict=${conditions.keywords.match.strict})` };

    if (!evaluateKeywordSet(content, conditions.keywords.exclude, "exclude"))
        return { trigger, matched: false, reason: `excluded keyword found (strict=${conditions.keywords.exclude.strict})` };

    return { trigger, matched: true };
}

// ─── Resultado final ──────────────────────────────────────────────────────────

export interface MatchResult {
    /**
     * O trigger vencedor, já resolvido.
     * null se nenhum trigger bateu ou a mensagem foi descartada por ambiguidade.
     */
    trigger: Trigger | null;
    /**
     * "none"      → nenhum trigger bateu
     * "matched"   → exatamente um trigger bateu (ou bypass resolveu)
     * "ambiguous" → mais de um trigger normal bateu → descartado
     */
    status: "none" | "matched" | "ambiguous";
    /** Todos os triggers que passaram nas conditions, para fins de debug */
    allMatched: Trigger[];
}

/**
 * Avalia uma mensagem contra todos os triggers ativos e resolve ambiguidade.
 *
 * Regras:
 * 1. Avalia conditions em todos os triggers ativos
 * 2. Separa os resultados em dois grupos:
 *    - bypass: triggers com bypassAmbiguity=true → sempre válidos, ignoram contagem
 *    - normal: triggers comuns → só válidos se exatamente 1 bateu
 * 3. Se houver mais de 1 trigger normal → mensagem ambígua → descarta normais
 * 4. Junta bypass + (normais válidos), ordena por prioridade, retorna o primeiro
 */
export function getMatchingTrigger(message: Message, activeTriggers: Trigger[]): MatchResult {
    const results = activeTriggers.map(t => evaluateTrigger(message, t));

    // Log de rejeições
    // for (const r of results) {
    //     if (!r.matched)
    //         logger.debug(`Trigger "${r.trigger.name}" rejected: ${r.reason}`);
    // }

    const matched = results.filter(r => r.matched).map(r => r.trigger);

    if (matched.length === 0) {
        // logger.debug("No triggers matched.");
        return { trigger: null, status: "none", allMatched: [] };
    }

    // Separa bypass dos normais
    const bypass = matched.filter(t => t.conditions.bypassMatchAmbiguity);
    const normals = matched.filter(t => !t.conditions.bypassMatchAmbiguity);

    let validNormals: Trigger[];

    if (normals.length > 1) {
        // Ambiguidade nos normais — descarta todos os normais
        // logger.warn(
        //     `Ambiguous message — ${normals.length} normal triggers matched: ` +
        //     normals.map(t => `"${t.name}"`).join(", ") +
        //     ". Discarding all normal triggers."
        // );
        validNormals = [];
    } else {
        validNormals = normals;
    }

    const candidates = [...bypass, ...validNormals];

    if (candidates.length === 0) {
        // Havia só normais ambíguos e nenhum bypass
        return { trigger: null, status: "ambiguous", allMatched: matched };
    }

    // Ordena por prioridade e pega o mais importante
    candidates.sort((a, b) => a.state.priority - b.state.priority);
    const winner = candidates[0];

    // logger.info(
    //     `Winner: "${winner.name}" (priority ${winner.state.priority}, bypass=${winner.state.bypassAmbiguity})` +
    //     (bypass.length > 0 ? ` | bypass triggers: ${bypass.map(t => t.name).join(", ")}` : "")
    // );

    return { trigger: winner, status: "matched", allMatched: matched };
}
