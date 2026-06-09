/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import { React, RunningGameStore } from "@webpack/common";

import { getRobloxProcess, joinUri, prepareAdb, rejoinUntilBiome, RejoinUntilBiomeHandle } from "../../../services/RobloxService";
import { settings } from "../../../settings";
import { JoinLockStore } from "../../../stores/JoinLockStore";
import { SnipeStore } from "../../../stores/SnipeStore";
import { checkForUpdates,isDeveloper } from "../../../utils";
import { EditableActionButton } from "../../ui/EditableActionButton";
import { Pill } from "../../ui/Pill";

const logger = new Logger("SolRadar.Developer");

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../../../native")>;


// @TODO fix this
// this is flaky dont use
// if we close the plugin modal this breaks and rejoins infinitely
// make isAutoRejoin save somewhere
// same to biome target so user doesnt have to type it again every time they reopen the ui
// also (kinda obvious) if you snipe with this running, you'll get kicked off your snipes
function BiomeFarmer() {
    const [biomeTarget, setBiomeTarget] = React.useState("glitch");
    const [handle, setHandle] = React.useState<RejoinUntilBiomeHandle | null>(null);
    const isAutoRejoining = handle !== null;

    async function toggle() {
        if (isAutoRejoining) {
            handle.cancel();
            setHandle(null);
        } else {
            const h = await rejoinUntilBiome(biomeTarget, () => setHandle(null));
            setHandle(h);
        }
    }

    return (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
                type="text"
                value={biomeTarget}
                onChange={e => setBiomeTarget(e.currentTarget.value)}
                placeholder="biome name..."
                disabled={isAutoRejoining}
                style={{
                    padding: "0.4rem 0.6rem",
                    borderRadius: "4px",
                    border: "1px solid var(--background-modifier-accent)",
                    background: "var(--input-background)",
                    color: "var(--text-normal)",
                    fontSize: "0.875rem",
                    opacity: isAutoRejoining ? 0.5 : 1,
                }}
            />
            <Button
                size="small"
                variant={isAutoRejoining ? "dangerPrimary" : "primary"}
                onClick={toggle}
                disabled={!biomeTarget.trim()}
            >
                {isAutoRejoining ? "stop rejoins" : "start rejoins"}
            </Button>
        </div>
    );
}

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
                <EditableActionButton
                    id="dev_openUri_one"
                    defaultLabel="openUri()"
                    defaultValue="roblox://experiences/start?placeId=15532962292"
                    onAction={data => joinUri(data)}
                />
                <EditableActionButton
                    id="dev_openUri_two"
                    defaultLabel="openUri()"
                    defaultValue="roblox://experiences/start?placeId=15532962292"
                    onAction={data => joinUri(data)}
                />
                <EditableActionButton
                    id="dev_prepareAdb"
                    defaultLabel="prepareAdb()"
                    defaultValue="roblox://experiences/start?placeId=15532962292"
                    placeholder="roblox://experiences/start?placeId=..."
                    onAction={data => prepareAdb(data)}
                />

                <Button size="small" variant="dangerPrimary" onClick={() => Native.closeRobloxOnEmulator(settings.store.ldpAdbPath, settings.store.ldpAdbDeviceSerial, settings.store.ldpAdbPackageName)}>
                    kill emulator
                </Button>

                <BiomeFarmer />
            </div>

            <Divider />

            <div style={row}>

                <Button size="small" onClick={() => logger.debug(getRobloxProcess())}>
                    getRobloxProcess
                </Button>

                <Button size="small" onClick={() => logger.debug(RunningGameStore.getRunningGames())}>
                    getRunningGames
                </Button>

                <Button size="small" variant="positive" onClick={() => JoinLockStore.activate(10, 30, "fakeLock")}>
                    JoinLockStore.activate(10, 30, "fakeLock")
                </Button>

                <Button size="small" variant="positive" onClick={() => SnipeStore.addFakes(1)}>
                    SnipeStore.addFake(1)
                </Button>

                <Button size="small" variant="positive" onClick={() => logger.debug(isDeveloper())}>
                    isDeveloper()
                </Button>

                <Button size="small" variant="positive" onClick={() => checkForUpdates()}>
                    Check for updates
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
