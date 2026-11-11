/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { Command, IconPath, MarkdownString, ThemeColor, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { ThemeIcons } from "vscode-ext-codicons";
import { currentIconThemeHasFolderIcon, getFolderIcon, getProjectIcon, getIconDetailsFromProjectPath, resolveCustomProjectIcon, colorizeIcon } from "../utils/icons";
import { REMOTE_PREFIX, VIRTUAL_WORKSPACE_PREFIX } from "../utils/remote";

export interface ProjectPreview {
    name: string;
    path: string;
    detail?: string;
    customIcon?: string;    // value of the `icon` field in projects.json
    customIconBaseDir?: string; // folder used to resolve relative icon paths
    customColor?: string;   // value of the `color` field in projects.json
}

export class ProjectNode extends TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly icon: string | undefined,
        public readonly preview: ProjectPreview,
        public readonly command?: Command
    ) {
        super(label, collapsibleState);

        if (icon) {
            this.iconPath = resolveCustomProjectIcon(preview.customIcon, preview.customIconBaseDir ?? "", preview.customColor)
                ?? colorizeIcon(this.getIconPath(icon, preview.path), preview.customColor);
            this.contextValue = "ProjectNodeKind";
        } else {
            this.contextValue = "ConfigNodeKind";
        }

        this.resourceUri = Uri.from({
            scheme: 'projectManagerFork-view',
            path: preview.path
        });

        const tooltipIcon = getIconDetailsFromProjectPath(preview.path);
        this.tooltip = new MarkdownString(
            `${label}\n\n_${preview.path}_\n\n${tooltipIcon.icon} ${tooltipIcon.title}`, true);
        this.description = preview.detail;
    }

    private getIconPath(icon: string, projectPath: string): string | IconPath {
        if (currentIconThemeHasFolderIcon()) {
            return getProjectIcon(icon, projectPath);
        } else {
            // if icon is a string that matches the pattern $(icon-name), returns corresponding ThemeIcon
            if (/^\$\([a-z-]+\)$/.test(icon)) {
                return new ThemeIcon(icon.substring(2, icon.length - 1));
            }
            switch (icon) {
                case "Git":
                case "Mercurial":
                    return ThemeIcons.git_merge;

                case "SVN":
                    return ThemeIcons.zap;

                case "VSCode":
                    return ThemeIcons.file_code;

                case "Any":
                    return ThemeIcons.folder;

                case "favorites":
                    return ThemeIcons.folder;

                case "favorites-workspace":
                    return ThemeIcons.root_folder;

                case "favorites-remote":
                    if (projectPath.startsWith(`${REMOTE_PREFIX}://codespaces`)) {
                        return ThemeIcons.github;
                    }
                    if (projectPath.startsWith(`${REMOTE_PREFIX}://dev-container`)) {
                        return new ThemeIcon('symbol-method', new ThemeColor("icon.foreground"));
                    }
                    if (projectPath.startsWith(`${REMOTE_PREFIX}://ssh`)) {
                        return ThemeIcons.terminal;
                    }
                    if (projectPath.startsWith(`${REMOTE_PREFIX}://wsl`)) {
                        return ThemeIcons.terminal_linux;
                    }
                    if (projectPath.startsWith(`${VIRTUAL_WORKSPACE_PREFIX}://`)) {
                        return ThemeIcons.remote;
                    }
                    return ThemeIcons.remote_explorer;

                default:
                    return getProjectIcon(icon, projectPath);
            }
        }
    }

}


export class TagNode extends TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState);
        this.iconPath = ThemeIcons.tag;
    }
}

export class NoTagNode extends TagNode {

    constructor(
        label: string,
        public readonly collapsibleState: TreeItemCollapsibleState,
    ) {
        super("", collapsibleState);
        this.description = label;
    }
}


/**
 * A (virtual) folder, defined by the `folder` field of the projects, used to group projects in the Side Bar.
 * It holds the projects (and, indirectly, the subfolders) it contains.
 */
export class FolderNode extends TreeItem {

    constructor(
        public readonly label: string,
        public readonly folderPath: string,     // full path of the folder (e.g. "Work/Clients")
        public readonly stateKey: string,       // key used to persist its expansion state
        public readonly projects: unknown[],    // projects inside this folder (or any of its subfolders)
        expanded: boolean
    ) {
        super(label, expanded ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
        this.contextValue = "FolderNodeKind";
        this.tooltip = folderPath;
        this.setExpanded(expanded);
    }

    public setExpanded(expanded: boolean): void {
        this.collapsibleState = expanded ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed;
        this.iconPath = getFolderIcon(expanded);
    }
}
