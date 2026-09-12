/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DragHandle.css";
import "./OrderSlot.css";

import { React } from "@webpack/common";

import { GripIcon } from "../icons/GripIcon";

interface DragHandleProps {
    visible: boolean;
    onPointerDownHandle: (e: React.PointerEvent<HTMLDivElement>) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

// Left-side, hover-revealed handle for dragging a trigger to reorder it.
// Also focusable + arrow-key operable, since dragging alone isn't keyboard-accessible.
// Drag itself is driven by pointer events (see TriggersTab) rather than native
// HTML5 drag-and-drop, which is unreliable for custom drag previews inside Electron.
export function DragHandle({ visible, onPointerDownHandle, onMoveUp, onMoveDown }: DragHandleProps) {
    return (
        <div
            className={`vc-sora-orderslot vc-sora-draghandle${visible ? " visible" : ""}`}
            onPointerDown={e => {
                // Capture the pointer so the eventual "click" (fired on release even
                // when the item is dropped back where it started) is redirected here
                // instead of whatever row happens to be under the cursor — this is
                // what stopPropagation below then swallows, instead of it bubbling up
                // to the card and opening the edit modal.
                e.currentTarget.setPointerCapture(e.pointerId);
                onPointerDownHandle(e);
            }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.stopPropagation()}
            tabIndex={0}
            role="button"
            aria-label="Reorder trigger"
            title="Drag to reorder · ↑/↓ to move"
            onKeyDown={e => {
                if (e.key === "ArrowUp") { e.preventDefault(); onMoveUp(); }
                else if (e.key === "ArrowDown") { e.preventDefault(); onMoveDown(); }
            }}
        >
            <GripIcon />
        </div>
    );
}
