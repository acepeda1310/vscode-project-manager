/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { commands } from "vscode";
import { Container } from "../core/container";

function openSettings(kind?: string) {
    commands.executeCommand("workbench.action.openSettings", kind ? `projectManagerFork.${kind}` : "projectManagerFork");
}


export function registerOpenSettings() {
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.openSettings#sideBarFavorites", () => openSettings()));
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.openSettings#sideBarVSCode", () => openSettings("vscode")));
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.openSettings#sideBarSVN", () => openSettings("svn")));
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.openSettings#sideBarGit", () => openSettings("git")));
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.openSettings#sideBarAny", () => openSettings("any")));
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.openSettings#sideBarMercurial", () => openSettings("hg")));
}