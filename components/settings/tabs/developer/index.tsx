/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Logger } from "@utils/Logger";
import { React, RunningGameStore } from "@webpack/common";

import { getRobloxProcess } from "../../../../services/RobloxService";
import { JoinLockStore } from "../../../../stores/JoinLockStore";
import { JoinStore } from "../../../../stores/JoinStore";
import { Pill } from "../../../Pill";

const logger = new Logger("SolRadar.Developer");

export function DeveloperTab() {
    const row: React.CSSProperties = {
        display: "flex",
        gap: "1rem",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        width: "100%"
    };

    const column: React.CSSProperties = {
        display: "flex",
        gap: "1rem",
        flexDirection: "column",
        alignItems: "center"
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "100%",
                maxWidth: "100%",
                padding: "1rem",
                boxSizing: "border-box"
            }}
        >
            {/* Header */}
            <div style={{ ...column, gap: 0 }}>
                <p style={{ fontSize: "1.2rem", color: "var(--text-muted)", fontWeight: "bold" }}>You're not supposed to be here!!</p>
                <p style={{ fontSize: "1rem", color: "var(--text-muted)" }}>This is a tab just for testing stuff.</p>
                <p style={{ fontSize: "1rem", color: "var(--text-muted)" }}>👉🔴🔵👈🤞🤌🫴🟣</p>
            </div>

            <Divider />

            {/* Actions */}
            <div style={row}>
                <Button size="small" onClick={() => logger.debug(getRobloxProcess())}>
                    getRobloxProcess
                </Button>

                <Button size="small" onClick={() => logger.debug(RunningGameStore.getRunningGames())}>
                    getRunningGames
                </Button>

                <Button size="small" variant="positive" onClick={() => JoinLockStore.activate(10, 30, "fakeLock")}>
                    + add fake lock (p10, 30s)
                </Button>

                <Button size="small" variant="positive" onClick={() => JoinStore.addFakes(1)}>
                    + add fake snipe
                </Button>
            </div>

            <Divider />

            {/* Buttons Showcase */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    width: "100%"
                }}
            >

                {/* Sizes */}
                <div style={row}>
                    <Button size="xs">size: xs</Button>
                    <Button size="small">size: small</Button>
                    <Button size="medium">size: medium</Button>
                    <Button size="min">size: min</Button>
                    {/* <Button size="iconOnly" title="size: iconOnly"/> */}
                </div>

                {/* Variants */}
                <div style={row}>
                    <Button variant="dangerPrimary" size="small">dangerPrimary</Button>
                    <Button variant="dangerSecondary" size="small">dangerSecondary</Button>
                    <Button variant="link" size="small">link</Button>
                    <Button variant="none" size="small">none</Button>
                    <Button variant="overlayPrimary" size="small">overlayPrimary</Button>
                    <Button variant="positive" size="small">positive</Button>
                    <Button variant="primary" size="small">primary</Button>
                    <Button variant="secondary" size="small">secondary</Button>
                </div>

            </div>

            <Divider />

            {/* Cards */}
            <div style={row}>
                <Card variant="danger" defaultPadding>
                    <span>Danger Card</span>
                </Card>

                <Card variant="normal" defaultPadding>
                    <span>Normal Card</span>
                </Card>

                <Card variant="warning" defaultPadding>
                    <span>Warning Card</span>
                </Card>
            </div>

            <Divider />

            {/* Pills Showcase */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    width: "100%"
                }}
            >
                {/* Sizes */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill size="xs" variant="brand">size: xs</Pill>
                    <Pill size="small" variant="brand">size: small</Pill>
                    <Pill variant="brand">size: default</Pill>
                </div>

                {/* Radius */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill radius="none" variant="blue">radius: none</Pill>
                    <Pill radius="xs" variant="blue">radius: xs</Pill>
                    <Pill radius="md" variant="blue">radius: md</Pill>
                    <Pill variant="blue">radius: default</Pill>
                </div>

                {/* Borders */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill border="subtle" variant="purple">border: subtle</Pill>
                    <Pill border="strong" variant="purple">border: strong</Pill>
                    <Pill variant="purple">border: none</Pill>
                </div>

                {/* Variants */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill variant="brand">brand</Pill>
                    <Pill variant="green">green</Pill>
                    <Pill variant="red">red</Pill>
                    <Pill variant="yellow">yellow</Pill>
                    <Pill variant="pink">pink</Pill>
                    <Pill variant="purple">purple</Pill>
                    <Pill variant="muted">muted</Pill>
                </div>

                {/* Icon Only */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill iconOnly emoji="🔥" variant="red" title="fire" />
                    <Pill iconOnly emoji="✨" variant="yellow" title="sparkle" />
                    <Pill iconOnly emoji="🟢" variant="green" title="status" />
                </div>

                {/* Long Content Test */}
                {/* why in gods name would you do that, what do you expect */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill variant="brand">
                        Lorem ipsum dolor sit, amet consectetur adipisicing elit. Fugit, explicabo, laudantium numquam, assumenda ratione amet tempore eveniet incidunt unde dolorum dolores delectus cupiditate optio impedit reiciendis beatae distinctio illo eos?
                    </Pill>

                    <Pill size="xs" variant="muted">
                        Lorem ipsum dolor sit, amet consectetur adipisicing elit. Fugit, explicabo, laudantium numquam, assumenda ratione amet tempore eveniet incidunt unde dolorum dolores delectus cupiditate optio impedit reiciendis beatae distinctio illo eos?
                    </Pill>
                </div>
            </div>
            <Divider />
        </div>
    );
}
