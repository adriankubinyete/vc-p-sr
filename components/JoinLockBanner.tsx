/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, useReducer } from "@webpack/common";
import { JoinLockStore, useJoinLock } from "userplugins/sradar/stores/JoinLockStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JoinLockBannerVariant =
    /** Compact, no explicit button — click anywhere to release. */
    | "minimal"
    /** Full banner with an explicit "Clear" button. */
    | "full";

export interface JoinLockBannerProps {
    variant?: JoinLockBannerVariant;
    style?: React.CSSProperties;
    className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JoinLockBanner({
    variant = "full",
    style,
    className,
}: JoinLockBannerProps) {
    const lock = useJoinLock();
    const [, tick] = useReducer(x => x + 1, 0);

    React.useEffect(() => {
        if (!lock) return;
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [lock]);

    if (!lock) return null;

    const secsRemaining = Math.ceil(JoinLockStore.msRemaining() / 1000);
    const isMinimal = variant === "minimal";

    return (
        <div
            onClick={isMinimal ? () => JoinLockStore.release() : undefined}
            className={className}
            title={isMinimal ? "Click to clear" : undefined}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: isMinimal ? "6px 10px" : "8px 12px",
                borderRadius: 8,
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid color-mix(in srgb, var(--yellow-300) 40%, transparent)",
                background: "color-mix(in srgb, var(--yellow-300) 8%, var(--background-secondary))",
                flexShrink: 0,
                cursor: isMinimal ? "pointer" : "default",
                transition: isMinimal ? "filter 0.1s" : undefined,
                userSelect: "none",
                ...style,
            }}
            // Subtle hover feedback only on minimal (entire row is clickable)
            onMouseEnter={isMinimal ? e => (e.currentTarget.style.filter = "brightness(1.08)") : undefined}
            onMouseLeave={isMinimal ? e => (e.currentTarget.style.filter = "") : undefined}
        >
            <span style={{ fontSize: isMinimal ? 13 : 16, flexShrink: 0 }}>🔒</span>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-normal)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>
                    Joins locked!
                    {/* {" "} */}
                    <span style={{ paddingLeft: 4,opacity: 0.5 }}>
                    {isMinimal ? (
                        <>expires in {secsRemaining}s · click here to clear</>
                    ) : (
                        <>expires in {secsRemaining}s</>
                    )}
                    </span>
                </div>

                {!isMinimal && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                        Trigger "{lock.triggerName}"
                        {" · "}
                        Anything with priority {lock.priority} or higher will be ignored!
                    </div>
                )}
            </div>

            {!isMinimal && (
                <Button
                    variant="dangerPrimary"
                    size="small"
                    onClick={() => JoinLockStore.release()}
                    style={{ flexShrink: 0 }}
                >
                    Clear
                </Button>
            )}
        </div>
    );
}
