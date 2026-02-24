/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { React,showToast, Toasts } from "@webpack/common";

import { settings } from "../../settings";
import { openSolsRadarModal } from "../settings/SolsRadarModal";
import { SolsRadarIcon } from "../ui/SolsRadarIcon";

const STATE_COLORS = {
    ACTIVE: "#43a25a",
    INACTIVE: "#f04747",
};

export const SolsRadarChatBarButton: ChatBarButtonFactory = ({ isMainChat }) => {
    // Lê estados reativamente → causa re-render quando mudam
    const { autoJoinEnabled, notificationEnabled, pluginIconShortcutAction } = settings.use([
        "autoJoinEnabled",
        "notificationEnabled",
        "pluginIconShortcutAction",
    ]);

    if (!isMainChat || settings.store.pluginIconLocation !== "chatbar") return null;

    const isActive = autoJoinEnabled; // ou ajuste a lógica se quiser considerar notificationEnabled também

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
                const newState = !autoJoinEnabled; // usa autoJoin como referência
                settings.store.autoJoinEnabled = newState;
                settings.store.notificationEnabled = newState;
                message = `Auto-join and notifications ${newState ? "enabled" : "disabled"}!`;
                toastType = newState ? Toasts.Type.SUCCESS : Toasts.Type.MESSAGE;
                break;

            default:
                // sem ação → toast neutro
                break;
        }

        if (message !== "No action taken.") {
            showToast(message, toastType);
        }
    };

    return (
        <ChatBarButton
            tooltip={`SolRadar ${isActive ? "(ACTIVE)" : "(INACTIVE)"}`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            buttonProps={{
                "aria-haspopup": "dialog",
                style: { position: "relative" },
            }}
        >
            <div style={{ position: "relative", display: "inline-block" }}>
                <SolsRadarIcon />

                {/* indicator */}
                <div
                    style={{
                        position: "absolute",
                        right: -6,
                        bottom: -6,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: isActive ? STATE_COLORS.ACTIVE : STATE_COLORS.INACTIVE,
                        border: "1.5px solid var(--background-primary)",
                        boxShadow: "0 0 3px rgba(0,0,0,0.3)",
                        transform: "scale(0.7)",
                    }}
                />
            </div>
        </ChatBarButton>
    );
};
