/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findComponentByCodeLazy } from "@webpack";
import { React,showToast, Toasts } from "@webpack/common";

import { settings } from "../../settings";
import { openSolsRadarModal } from "../settings/SolsRadarModal";
import { SolsRadarIcon } from "../ui/SolsRadarIcon";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_TOP:", '"aria-haspopup":');

const STATE_COLORS = {
    ACTIVE: "#43a25a",
    INACTIVE: "#f04747",
};

interface SolsRadarTitleBarButtonProps {
    className?: string;
}

export function SolsRadarTitleBarButton({ className = "" }: SolsRadarTitleBarButtonProps) {
    const { autoJoinEnabled, notificationEnabled, pluginIconShortcutAction, hideInactiveIndicator } = settings.use([
        "autoJoinEnabled",
        "notificationEnabled",
        "pluginIconShortcutAction",
        "hideInactiveIndicator",
    ]);

    const isActive = autoJoinEnabled;
    const stateText = isActive ? "ACTIVE" : "INACTIVE";

    const handleClick = () => {
        openSolsRadarModal();
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();

        let message = "No action taken.";
        let toastType = Toasts.Type.MESSAGE;

        switch (pluginIconShortcutAction) {
            case "toggle_join":
                const newJoin = !autoJoinEnabled;
                settings.store.autoJoinEnabled = newJoin;
                message = `Auto-join ${newJoin ? "enabled" : "disabled"}!`;
                toastType = newJoin ? Toasts.Type.SUCCESS : Toasts.Type.MESSAGE;
                break;

            case "toggle_notification":
                const newNotif = !notificationEnabled;
                settings.store.notificationEnabled = newNotif;
                message = `Notifications ${newNotif ? "enabled" : "disabled"}!`;
                toastType = newNotif ? Toasts.Type.SUCCESS : Toasts.Type.MESSAGE;
                break;

            case "toggle_both":
                const newState = !autoJoinEnabled;
                settings.store.autoJoinEnabled = newState;
                settings.store.notificationEnabled = newState;
                message = `Auto-join and notifications ${newState ? "enabled" : "disabled"}!`;
                toastType = newState ? Toasts.Type.SUCCESS : Toasts.Type.MESSAGE;
                break;

            default:
                break;
        }

        if (message !== "No action taken.") {
            showToast(message, toastType);
        }
    };

    return (
        <HeaderBarIcon
            className={typeof className === "object" ? Object.values(className as any).join(" ") : className}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            tooltip={`SolRadar (${stateText})`}
            aria-haspopup="dialog"
            icon={() => (
                <div style={{ position: "relative", display: "inline-block" }}>
                    <SolsRadarIcon height={20} width={20} />

                    {/* indicator */}
                    {(isActive || !hideInactiveIndicator) && (<div
                        style={{
                            position: "absolute",
                            right: 4,
                            bottom: 4,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: isActive ? STATE_COLORS.ACTIVE : STATE_COLORS.INACTIVE,
                            border: "1.5px solid var(--background-primary)",
                            boxShadow: "0 0 3px rgba(0,0,0,0.3)",
                            transform: "scale(0.7)",
                        }}
                    />)}
                </div>
            )}
            selected={isActive}
        />
    );
}
