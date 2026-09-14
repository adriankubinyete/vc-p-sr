/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    CopyIcon,
    DeleteIcon,
    InfoIcon,
    LinkIcon,
    OpenExternalIcon,
} from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import { closeAllModals } from "@utils/modal";
import { ContextMenuApi, Menu, NavigationRouter, React, showToast, Toasts } from "@webpack/common";

import { joinUri } from "../../../services/RobloxService";
import { SnipeEntry, SnipeStore } from "../../../stores/SnipeStore";
import { openJoinModal } from "./JoinModal";

function jumpToMessage(entry: SnipeEntry): void {
    if (!entry.messageJumpUrl) return;
    try {
        NavigationRouter.transitionTo(new URL(entry.messageJumpUrl).pathname);
        closeAllModals();
    } catch {
        showToast("Failed to navigate.", Toasts.Type.FAILURE);
    }
}

function copyServerLink(entry: SnipeEntry): void {
    if (!entry.link) return;
    copyToClipboard(entry.link);
    showToast("Copied!", Toasts.Type.SUCCESS);
}

function joinServer(entry: SnipeEntry): void {
    if (!entry.joinUri) { showToast("No join link detected.", Toasts.Type.FAILURE); return; }
    joinUri(entry.joinUri).catch(() => showToast("Failed to join server.", Toasts.Type.FAILURE));
}

export function openSnipeContextMenu(e: React.MouseEvent, entry: SnipeEntry): void {
    ContextMenuApi.openContextMenu(e, () => <SnipeContextMenu entry={entry} />);
}

function SnipeContextMenu({ entry }: { entry: SnipeEntry; }) {
    return (
        <Menu.Menu
            navId="vc-sora-snipe-context-menu"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Snipe Options"
        >
            <Menu.MenuItem
                id="vc-sora-snipe-details"
                label="Details"
                leadingAccessory={{ type: "icon", icon: InfoIcon }}
                action={() => openJoinModal(entry)}
            />
            {entry.messageJumpUrl && (
                <Menu.MenuItem
                    id="vc-sora-snipe-jump"
                    label="Jump to message"
                    leadingAccessory={{ type: "icon", icon: LinkIcon }}
                    action={() => jumpToMessage(entry)}
                />
            )}
            {entry.link && (
                <Menu.MenuItem
                    id="vc-sora-snipe-copy-link"
                    label="Copy server link"
                    leadingAccessory={{ type: "icon", icon: CopyIcon }}
                    action={() => copyServerLink(entry)}
                />
            )}
            {entry.joinUri && (
                <Menu.MenuItem
                    id="vc-sora-snipe-join"
                    label="Join server"
                    leadingAccessory={{ type: "icon", icon: OpenExternalIcon }}
                    action={() => joinServer(entry)}
                />
            )}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-sora-snipe-remove"
                label="Remove"
                color="danger"
                leadingAccessory={{ type: "icon", icon: DeleteIcon }}
                action={() => SnipeStore.delete(entry.id)}
            />
        </Menu.Menu>
    );
}
