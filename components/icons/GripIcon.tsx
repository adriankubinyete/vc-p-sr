/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconComponent } from "@utils/types";

// Eight-dot "grip" glyph (4 rows × 2 cols), used as the drag handle for
// reordering triggers. Same dot size/spacing as a standard 6-dot grip
// (r=1.3, 5-unit row gap, 6-unit column gap) — the viewBox is just extended
// to fit more rows, not compressed to fit a fixed height (that looked squished).
export const GripIcon: IconComponent = ({ height = 21, width = 16, className, color }) => {
    return (
        <svg
            aria-hidden="true"
            role="img"
            width={width}
            height={height}
            className={className}
            viewBox="0 0 16 21"
            fill="currentColor"
            style={{ color }}
        >
            <circle cx="5" cy="3" r="1.3" />
            <circle cx="11" cy="3" r="1.3" />
            <circle cx="5" cy="8" r="1.3" />
            <circle cx="11" cy="8" r="1.3" />
            <circle cx="5" cy="13" r="1.3" />
            <circle cx="11" cy="13" r="1.3" />
            <circle cx="5" cy="18" r="1.3" />
            <circle cx="11" cy="18" r="1.3" />
        </svg>
    );
};
