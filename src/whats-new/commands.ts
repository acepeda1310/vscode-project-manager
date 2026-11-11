/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { commands } from "vscode";
import { Container } from "../core/container";
import { WhatsNewManager } from "../../vscode-whats-new/src/Manager";
import { ProjectManagerContentProvider, ProjectManagerSocialMediaProvider } from "./contentProvider";

export function registerWhatsNew() {
    const provider = new ProjectManagerContentProvider();
    const viewer = new WhatsNewManager(Container.context)
        .registerContentProvider("adriancepeda", "project-manager-fork", provider)
        .registerSocialMediaProvider(new ProjectManagerSocialMediaProvider());
    viewer.showPageInActivation();
    Container.context.subscriptions.push(commands.registerCommand("projectManagerFork.whatsNew", () => viewer.showPage()));
    Container.context.subscriptions.push(commands.registerCommand("_projectManagerFork.whatsNewContextMenu", () => viewer.showPage()));
}
