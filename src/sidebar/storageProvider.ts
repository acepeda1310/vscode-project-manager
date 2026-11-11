/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import path = require("path");
import * as vscode from "vscode";
import { Container } from "../core/container";
import { ProjectStorage } from "../storage/storage";
import { PathUtils } from "../utils/path";
import { isRemotePath } from "../utils/remote";
import { sortProjects } from "../utils/sorter";
import { getGitBranch } from "../utils/git";
import { NO_TAGS_DEFINED } from "./constants";
import { FolderNode, NoTagNode, ProjectNode, TagNode } from "./nodes";

interface ProjectInQuickPick {
    label: string;
    description: string;
    profile: string;
    icon?: string;
    color?: string;
    folder?: string;
}

export type StorageNode = ProjectNode | TagNode | FolderNode;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ProjectInQuickPickList extends Array<ProjectInQuickPick> { }

export class StorageProvider implements vscode.TreeDataProvider<StorageNode> {

    public readonly onDidChangeTreeData: vscode.Event<StorageNode | void>;

    private projectSource: ProjectStorage;
    private internalOnDidChangeTreeData: vscode.EventEmitter<StorageNode | void> = new vscode.EventEmitter<StorageNode | void>();
    private static readonly TAGS_EXPANSION_STATE_KEY = "projectsExplorerForkFavorites.tagsExpansionState";
    private static readonly FOLDERS_EXPANSION_STATE_KEY = "projectsExplorerForkFavorites.foldersExpansionState";

    constructor(projectSource: ProjectStorage) {
        this.projectSource = projectSource;
        this.onDidChangeTreeData = this.internalOnDidChangeTreeData.event;
    }

    private static getTagExpansionState(): Record<string, boolean> {
        return Container.context.globalState.get<Record<string, boolean>>(StorageProvider.TAGS_EXPANSION_STATE_KEY, {});
    }

    public static async resetTagExpansionState(): Promise<void> {
        await Container.context.globalState.update(StorageProvider.TAGS_EXPANSION_STATE_KEY, {});
    }

    public static getTagCollapsibleState(tagId: string, behavior: string): vscode.TreeItemCollapsibleState {
        switch (behavior) {
            case "alwaysExpanded":
                return vscode.TreeItemCollapsibleState.Expanded;
            case "alwaysCollapsed":
                return vscode.TreeItemCollapsibleState.Collapsed;
            case "startExpanded":
            case "startCollapsed": {
                const expansionState = StorageProvider.getTagExpansionState();
                const isExpanded = expansionState[ tagId ];
                if (isExpanded === undefined) {
                    return behavior === "startExpanded" ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
                }
                return isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
            }
            default:
                return vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    public static async setTagExpanded(tagId: string, expanded: boolean): Promise<void> {
        const expansionState = StorageProvider.getTagExpansionState();
        const newExpansionState = { ...expansionState, [ tagId ]: expanded };
        await Container.context.globalState.update(StorageProvider.TAGS_EXPANSION_STATE_KEY, newExpansionState);
    }

    private static getFolderExpansionState(): Record<string, boolean> {
        return Container.context.globalState.get<Record<string, boolean>>(StorageProvider.FOLDERS_EXPANSION_STATE_KEY, {});
    }

    public static isFolderExpanded(stateKey: string): boolean {
        return StorageProvider.getFolderExpansionState()[ stateKey ] ?? false;
    }

    public static async setFolderExpanded(stateKey: string, expanded: boolean): Promise<void> {
        const expansionState = StorageProvider.getFolderExpansionState();
        await Container.context.globalState.update(StorageProvider.FOLDERS_EXPANSION_STATE_KEY, { ...expansionState, [ stateKey ]: expanded });
    }

    public refresh(element?: StorageNode): void {
        this.internalOnDidChangeTreeData.fire(element);
    }

    public getTreeItem(element: StorageNode): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: StorageNode): Thenable<StorageNode[]> {
        return Promise.resolve(this.getChildrenNodes(element));
    }

    private getChildrenNodes(element?: StorageNode): StorageNode[] {

        if (element instanceof FolderNode) {
            return this.buildLevel(<ProjectInQuickPickList>element.projects, element.folderPath, element.stateKey);
        }

        if (element instanceof TagNode) {
            const projectsMapped = <ProjectInQuickPickList>this.projectSource.getProjectsByTag(element.label);
            return this.buildLevel(projectsMapped, "", `tag:${element.label}|`);
        }

        if (element) {
            return [];
        }

        // ROOT

        // no project saved yet, returns [] `empty`...
        if (this.projectSource.length() === 0) {
            return [];
        }

        // choose the view
        const viewAsList = Container.context.globalState.get<boolean>("viewAsList", true);

        // viewAsTags - must have at least one tag otherwise, use `viewAsList`
        if (!viewAsList) {
            let nodes: TagNode[] = [];

            const tagsCollapseBehavior = vscode.workspace.getConfiguration("projectManagerFork").get<string>("tags.collapseItems", "startExpanded");
            const tags = this.projectSource.getAvailableTags().sort();
            for (const tag of tags) {
                nodes.push(new TagNode(tag, StorageProvider.getTagCollapsibleState(tag, tagsCollapseBehavior)));
            }

            // has any, then OK
            if (nodes.length > 0) {
                if (this.projectSource.getProjectsByTag('').length !== 0) {
                    nodes.push(new NoTagNode(NO_TAGS_DEFINED, StorageProvider.getTagCollapsibleState(NO_TAGS_DEFINED, tagsCollapseBehavior)));
                }

                // should filter ?
                const filterByTags = Container.context.globalState.get<string[]>("filterByTags", []);
                if (filterByTags.length > 0) {
                    nodes = nodes.filter(node => filterByTags.includes(node.label)
                        || (filterByTags.includes(NO_TAGS_DEFINED) && node.label === ""));
                }

                return nodes;
            }
        }

        // viewAsList OR no Tags
        let projectsMapped: ProjectInQuickPickList;

        const filterByTags = Container.context.globalState.get<string[]>("filterByTags", []);
        if (filterByTags.length > 0) {
            projectsMapped = <ProjectInQuickPickList>this.projectSource.getProjectsByTags(filterByTags);
        } else {
            projectsMapped = <ProjectInQuickPickList>this.projectSource.map();
        }

        return this.buildLevel(projectsMapped, "", "");
    }

    /**
     * Builds one level of the tree: the folders directly below `parentFolder` (sorted by name) followed
     * by the projects located exactly in `parentFolder` (sorted using the `sortList` setting).
     */
    private buildLevel(projects: ProjectInQuickPickList, parentFolder: string, stateKeyPrefix: string): StorageNode[] {
        const { folders, projects: levelProjects } = groupProjectsByFolder(projects, parentFolder);

        const folderNodes: FolderNode[] = [];
        for (const folder of folders) {
            const stateKey = stateKeyPrefix + folder.path;
            folderNodes.push(new FolderNode(folder.name, folder.path, stateKey, folder.projects,
                StorageProvider.isFolderExpanded(stateKey)));
        }

        const showGitBranch = vscode.workspace.getConfiguration("projectManagerFork").get<string>("git.showBranchName", "never");
        const projectNodes = sortProjects(levelProjects).map((prj: ProjectInQuickPick) => this.createProjectNode(prj, showGitBranch));

        return [ ...folderNodes, ...projectNodes ];
    }

    private createProjectNode(prj: ProjectInQuickPick, showGitBranch: string): ProjectNode {
        let iconFavorites = "favorites";
        if (path.extname(prj.description) === ".code-workspace") {
            iconFavorites = "favorites-workspace";
        } else if (isRemotePath(prj.description)) {
            iconFavorites = "favorites-remote";
        }

        const projectPath = PathUtils.expandHomePath(prj.description);
        const gitBranch = (showGitBranch === "always" || showGitBranch === "onlyInSideBar") ? getGitBranch(projectPath) : undefined;

        return new ProjectNode(prj.label, vscode.TreeItemCollapsibleState.None,
            iconFavorites, {
                name: prj.label,
                path: projectPath,
                detail: gitBranch,
                customIcon: prj.icon,
                customColor: prj.color,
                customIconBaseDir: this.projectSource.getDirectory()
            }, {
                command: "_projectManagerFork.open",
                title: "",
                arguments: [ projectPath, prj.label, prj.profile ],
            });
    }

}

export interface FolderGroup<T> {
    name: string;   // name of the folder (last segment)
    path: string;   // full path of the folder
    projects: T[];  // projects inside the folder (or any of its subfolders)
}

/**
 * Splits `projects` (all of them inside `parentFolder`) into the folders directly below `parentFolder`
 * (sorted by name, case insensitive) and the projects located exactly in `parentFolder`.
 */
export function groupProjectsByFolder<T extends { folder?: string }>(projects: T[], parentFolder: string): { folders: FolderGroup<T>[]; projects: T[] } {
    const depth = parentFolder === "" ? 0 : parentFolder.split("/").length;
    const folders = new Map<string, FolderGroup<T>>();
    const levelProjects: T[] = [];

    for (const project of projects) {
        const segments = project.folder ? project.folder.split("/") : [];
        if (segments.length <= depth) {
            levelProjects.push(project);
            continue;
        }
        const name = segments[ depth ];
        let folder = folders.get(name);
        if (!folder) {
            folder = { name, path: segments.slice(0, depth + 1).join("/"), projects: [] };
            folders.set(name, folder);
        }
        folder.projects.push(project);
    }

    const sortedFolders = [ ...folders.values() ].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    return { folders: sortedFolders, projects: levelProjects };
}
