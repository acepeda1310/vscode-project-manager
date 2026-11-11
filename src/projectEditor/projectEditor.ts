/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { l10n } from "vscode";
import fs = require("fs");
import path = require("path");
import { Project, sanitizeProject } from "../core/project";
import { ProjectStorage } from "../storage/storage";
import { normalizeColor } from "../utils/icons";
import { PathUtils } from "../utils/path";
import { isRemotePath } from "../utils/remote";

/** Called after a project has been saved from the editor. `oldName` is undefined for new projects */
type ProjectSavedCallback = (project: Project, oldName: string | undefined) => void;

interface BrowseMessage {
    type: "browse";
    target: "rootPath" | "path" | "icon";
    mode?: "folder" | "workspace";
    index?: number;
    current?: string;
}

interface ImagePreviewMessage {
    type: "imagePreview";
    value: string;
}

interface SaveMessage {
    type: "save";
    project: Project;
}

type WebviewMessage = { type: "ready" } | { type: "cancel" } | BrowseMessage | ImagePreviewMessage | SaveMessage;

const IMAGE_FILE = /\.(svg|png)$/i;
const MAX_IMAGE_PREVIEW_SIZE = 1024 * 1024;

/** Key used to reuse the panel of a project already being edited ("" for new projects) */
const openPanels = new Map<string, vscode.WebviewPanel>();

/**
 * Opens a form (Webview) to create a new project (`projectName` undefined) or edit an existing one.
 */
export function openProjectEditor(context: vscode.ExtensionContext, storage: ProjectStorage,
    onSaved: ProjectSavedCallback, projectName?: string): void {

    const original = projectName ? storage.getProject(projectName) : undefined;
    if (projectName && !original) {
        vscode.window.showErrorMessage(l10n.t("Project \"{0}\" not found.", projectName));
        return;
    }

    let panelKey = original ? original.name.toLowerCase() : "";
    const existingPanel = openPanels.get(panelKey);
    if (existingPanel) {
        existingPanel.reveal();
        return;
    }

    const mediaUri = vscode.Uri.joinPath(context.extensionUri, "media");
    const codiconsUri = vscode.Uri.joinPath(context.extensionUri, "dist", "codicons");

    const panel = vscode.window.createWebviewPanel(
        "projectManagerFork.projectEditor",
        original ? l10n.t("Edit Project: {0}", original.name) : l10n.t("New Project"),
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [ mediaUri, codiconsUri ]
        }
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "docs", "images", "icon.png");
    openPanels.set(panelKey, panel);

    // the name of the project being edited (changes if the project is renamed and the panel stays open)
    let editingName = original?.name;

    panel.webview.html = getHtml(panel.webview, mediaUri);

    const post = (message: unknown) => panel.webview.postMessage(message);

    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
        switch (message.type) {
            case "ready":
                post({
                    type: "init",
                    isNew: !original,
                    project: original ?? { name: "", rootPath: "", paths: [], tags: [], enabled: true, profile: "" },
                    tags: getAvailableTags(storage),
                    folders: storage.getAvailableFolders(),
                    codicons: getCodiconNames(codiconsUri.fsPath),
                    codiconsBaseUri: panel.webview.asWebviewUri(codiconsUri).toString(),
                    strings: getStrings()
                });
                break;

            case "browse": {
                const value = await browse(message, storage);
                if (value !== undefined) {
                    post({ type: "browseResult", target: message.target, index: message.index, value });
                }
                break;
            }

            case "imagePreview":
                post({ type: "imagePreview", value: message.value, src: getImageDataUri(message.value, storage.getDirectory()) });
                break;

            case "save": {
                const error = validate(message.project, storage, editingName);
                if (error) {
                    post({ type: "error", message: error });
                    return;
                }
                const project = sanitizeProject(message.project);
                if (editingName) {
                    storage.update(editingName, project);
                } else {
                    storage.add(project);
                }
                storage.save();
                onSaved(project, editingName);
                vscode.window.showInformationMessage(l10n.t("Project saved!"));

                openPanels.delete(panelKey);
                panelKey = project.name.toLowerCase();
                editingName = project.name;
                panel.dispose();
                break;
            }

            case "cancel":
                panel.dispose();
                break;
        }
    }, undefined, context.subscriptions);

    panel.onDidDispose(() => {
        if (openPanels.get(panelKey) === panel) {
            openPanels.delete(panelKey);
        }
    }, undefined, context.subscriptions);
}

function validate(project: Project, storage: ProjectStorage, editingName: string | undefined): string | undefined {
    const name = (project.name ?? "").trim();
    if (name === "") {
        return l10n.t("You must define a name for the project.");
    }
    if ((project.rootPath ?? "").trim() === "") {
        return l10n.t("You must define the root path of the project.");
    }
    const isSameProject = editingName !== undefined && editingName.toLowerCase() === name.toLowerCase();
    if (!isSameProject && storage.exists(name)) {
        return l10n.t("Project already exists!");
    }
    const color = (project.color ?? "").trim();
    if (color !== "" && !normalizeColor(color)) {
        return l10n.t("Invalid color \"{0}\". Use a CSS color name or a hex value (#bb0000).", color);
    }
    return undefined;
}

async function browse(message: BrowseMessage, storage: ProjectStorage): Promise<string | undefined> {
    const defaultUri = getDefaultUri(message.current, storage.getDirectory());

    let options: vscode.OpenDialogOptions;
    if (message.target === "icon") {
        options = {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { [ l10n.t("Images") ]: [ "svg", "png" ] },
            openLabel: l10n.t("Select Icon"),
            defaultUri
        };
    } else if (message.mode === "workspace") {
        options = {
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { [ l10n.t("Workspaces") ]: [ "code-workspace" ] },
            openLabel: l10n.t("Select Workspace"),
            defaultUri
        };
    } else {
        options = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: l10n.t("Select Folder"),
            defaultUri
        };
    }

    const picked = await vscode.window.showOpenDialog(options);
    if (!picked || picked.length === 0) {
        return undefined;
    }
    return picked[ 0 ].scheme === "file" ? picked[ 0 ].fsPath : picked[ 0 ].toString();
}

function getDefaultUri(current: string | undefined, baseDir: string): vscode.Uri | undefined {
    try {
        if (current && current.trim() !== "" && !isRemotePath(current)) {
            let currentPath = PathUtils.expandHomePath(current.trim());
            if (!path.isAbsolute(currentPath)) {
                currentPath = path.resolve(baseDir, currentPath);
            }
            if (fs.existsSync(currentPath)) {
                return vscode.Uri.file(currentPath);
            }
        }
    } catch {
        // ignore, use the default location
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[ 0 ];
    return workspaceFolder?.uri.scheme === "file" ? workspaceFolder.uri : undefined;
}

/** Reads a local .svg/.png icon (absolute, `~`/`$home` based or relative to projects.json) as a data URI */
function getImageDataUri(value: string, baseDir: string): string | undefined {
    try {
        const trimmed = (value ?? "").trim();
        if (!IMAGE_FILE.test(trimmed)) {
            return undefined;
        }
        let imagePath = PathUtils.expandHomePath(trimmed);
        if (!path.isAbsolute(imagePath)) {
            imagePath = path.resolve(baseDir, imagePath);
        }
        if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size > MAX_IMAGE_PREVIEW_SIZE) {
            return undefined;
        }
        const mime = imagePath.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
        return `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
    } catch {
        return undefined;
    }
}

function getAvailableTags(storage: ProjectStorage): string[] {
    const defaultTags = vscode.workspace.getConfiguration("projectManagerFork").get<string[]>("tags") ?? [];
    return [ ...new Set([ ...storage.getAvailableTags(), ...defaultTags ]) ].sort((a, b) => a.localeCompare(b));
}

function getCodiconNames(codiconsPath: string): string[] {
    try {
        return fs.readdirSync(codiconsPath)
            .filter(file => file.endsWith(".svg"))
            .map(file => file.slice(0, -4))
            .sort();
    } catch {
        return [];
    }
}

function getStrings(): Record<string, string> {
    return {
        newProject: l10n.t("New Project"),
        editProject: l10n.t("Edit Project"),
        name: l10n.t("Name"),
        namePlaceholder: l10n.t("Type a name for your project"),
        rootPath: l10n.t("Root Path"),
        rootPathHint: l10n.t("Folder or .code-workspace file of the project. Remote URIs (vscode-remote://...) are also accepted."),
        paths: l10n.t("Additional Paths"),
        pathsHint: l10n.t("Other paths of the project, for multi-folder projects."),
        addPath: l10n.t("Add Path"),
        folderButton: l10n.t("Folder..."),
        workspaceButton: l10n.t("Workspace..."),
        browse: l10n.t("Browse..."),
        remove: l10n.t("Remove"),
        tags: l10n.t("Tags"),
        tagsPlaceholder: l10n.t("Type a tag and press Enter"),
        enabled: l10n.t("Enabled"),
        enabledHint: l10n.t("Disabled projects are not displayed in the project list."),
        icon: l10n.t("Icon"),
        iconNone: l10n.t("Default"),
        iconCodicon: l10n.t("Icon"),
        iconImage: l10n.t("Image"),
        iconEmoji: l10n.t("Emoji"),
        iconSearch: l10n.t("Search icons..."),
        iconImagePlaceholder: l10n.t("Path to a .svg or .png file"),
        iconImageHint: l10n.t("Absolute path, based on ~ or relative to the folder of projects.json."),
        iconImageNotFound: l10n.t("Image not found"),
        iconEmojiPlaceholder: l10n.t("Type or paste an emoji"),
        iconDefaultHint: l10n.t("The default icon (based on the kind of project) is used."),
        noIconsFound: l10n.t("No icons found"),
        color: l10n.t("Color"),
        colorHint: l10n.t("Only applies to icons (codicons), including the default ones."),
        colorPlaceholder: l10n.t("Color name or #hex"),
        clear: l10n.t("Clear"),
        folder: l10n.t("Folder"),
        folderNone: l10n.t("(No folder)"),
        folderNew: l10n.t("New folder..."),
        folderNewPlaceholder: l10n.t("Folder name (use / for subfolders, e.g. Work/Clients)"),
        folderHint: l10n.t("Groups the project into a folder in the Side Bar."),
        profile: l10n.t("Profile"),
        profilePlaceholder: l10n.t("Name of the VS Code profile (optional)"),
        save: l10n.t("Save"),
        cancel: l10n.t("Cancel"),
        required: l10n.t("Required"),
    };
}

function getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let index = 0; index < 32; index++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}

function getHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "projectEditor.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "projectEditor.css"));
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}'`
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Project</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
