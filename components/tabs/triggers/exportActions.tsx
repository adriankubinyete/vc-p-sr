/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Paragraph } from "@components/Paragraph";
import { Alerts, React, showToast, Toasts } from "@webpack/common";

import { downloadTriggerJsonRedacted, RedactField, Trigger } from "../../../stores/TriggerStore";
import { PublicExportOptions } from "./PublicExportOptions";

/**
 * Shows the same "this trigger has a webhook configured" warning used by the
 * toolbar's bulk export, scoped to any list of triggers (usually just one).
 * Calls `run()` immediately if none of them have a webhook configured.
 */
export function confirmWebhookThenRun(triggers: Trigger[], run: () => void): void {
    const triggersWithWebhooks = triggers.filter(t => t.forwarding.webhookUrl.trim());

    if (triggersWithWebhooks.length === 0) {
        run();
        return;
    }

    const triggerList = triggersWithWebhooks.map(t => `• ${t.name}`).join("\n");

    Alerts.show({
        title: "Hold on!",
        body: (
            <Paragraph>
                The following triggers have a webhook URL configured:
                <pre style={{ margin: "8px 0", color: "var(--text-muted)" }}>{triggerList}</pre>
                Exporting will include these URLs in plain text. Are you sure you want to proceed?
            </Paragraph>
        ),
        confirmText: "Export anyway",
        cancelText: "Cancel",
        onConfirm: run,
    });
}

export function copyTriggerToClipboard(trigger: Trigger): void {
    try {
        const { id, ...rest } = trigger;
        navigator.clipboard.writeText(JSON.stringify([rest], null, 2));
        showToast("Trigger copied to clipboard!", Toasts.Type.SUCCESS);
    } catch (e) {
        showToast(`Failed to copy trigger: ${e}`, Toasts.Type.FAILURE);
    }
}

export function openSafeExportDialogForTrigger(trigger: Trigger): void {
    let currentFields = new Set<RedactField>(["webhookUrl", "webhookForwarding", "notificationSound", "enabled", "customTriggers"]);

    Alerts.show({
        title: `Safe Export — ${trigger.name}`,
        body: <PublicExportOptions onChange={fields => { currentFields = fields; }} />,
        confirmText: "Export",
        cancelText: "Cancel",
        onConfirm: () => {
            try {
                downloadTriggerJsonRedacted(trigger, { redact: [...currentFields] });
                showToast("Trigger exported (safe)!", Toasts.Type.SUCCESS);
            } catch (error) {
                showToast(`Failed to export trigger: ${error}`, Toasts.Type.FAILURE);
            }
        },
    });
}
