/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");
import { IconPath, ThemeIcon, Uri, workspace } from "vscode";
import { codicons } from "vscode-ext-codicons";
import { Container } from "../core/container";
import { PathUtils } from "./path";
import { isRemoteUri, REMOTE_PREFIX, VIRTUAL_WORKSPACE_PREFIX } from "./remote";

export function currentIconThemeHasFolderIcon(): boolean {
    const currentIconTheme = workspace.getConfiguration("workbench").get<string>("iconTheme", "");

    return currentIconTheme === null || currentIconTheme === "vs-seti";
}

function translateCodiconToLocalIcons(codicon: string): string {
    switch (codicon) {
        case codicons.file_code: return "vscode";
        case codicons.git_branch: return "git";
        case codicons.zap: return "svn";
        case codicons.file_directory: return "folder";
        case codicons.root_folder: return "favorites-workspace";
        default: return codicon;
    }
}

export function getProjectIconPath(icon: string, lightDark: string): string {
    return "docs/images/ico-" + translateCodiconToLocalIcons(icon) + "-" + lightDark + ".svg";
}

export function getProjectIcon(icon: string, projectPath: string): string | IconPath {
    if (projectPath.startsWith(`${REMOTE_PREFIX}://codespaces`)) {
        return {
            light: Uri.joinPath(Container.context.extensionUri, getProjectIconPath("favorites-remote-codespaces", "light")),
            dark: Uri.joinPath(Container.context.extensionUri, getProjectIconPath("favorites-remote-codespaces", "dark"))
        };
    }

    return {
        light: Uri.joinPath(Container.context.extensionUri, getProjectIconPath(icon, "light")),
        dark: Uri.joinPath(Container.context.extensionUri, getProjectIconPath(icon, "dark"))
    };
}

export function getCodiconFromUri(uri: Uri): string {
    if (!isRemoteUri(uri)) {
        return codicons.file_directory;
    }

    return uri.scheme === REMOTE_PREFIX
        ? codicons.remote_explorer
        : codicons.remote;
}

export interface TooltipIconInfo {
    icon: string,
    title: string
}

export function getIconDetailsFromProjectPath(projectPath: string): TooltipIconInfo {
    if (projectPath.startsWith(`${REMOTE_PREFIX}://codespaces`)) {
        return {
            icon: codicons.github,
            title: "Codespaces"
        };
    }
    if (projectPath.startsWith(`${REMOTE_PREFIX}://dev-container`)) {
        return {
            icon: codicons.symbol_method,
            title: "Container"
        };
    }
    if (projectPath.startsWith(`${REMOTE_PREFIX}://ssh`)) {
        return {
            icon: codicons.terminal,
            title: "SSH"
        };
    }
    if (projectPath.startsWith(`${REMOTE_PREFIX}://wsl`)) {
        return {
            icon: codicons.terminal_linux,
            title: "WSL"
        };
    }
    if (projectPath.startsWith(`${VIRTUAL_WORKSPACE_PREFIX}://`)) {
        return {
            icon: codicons.remote,
            title: "Virtual Workspace"
        };
    }
    if (path.extname(projectPath) === ".code-workspace") {
        return {
            icon: codicons.root_folder,
            title: "Workspace"
        };
    }
    return {
        icon: codicons.folder,
        title: "Folder"
    };
}

const CODICON_WITH_SYNTAX = /^\$\(([a-z0-9-]+)(?:~[a-z]+)?\)$/;
const CODICON_BARE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_FILE = /\.(svg|png)$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// CSS named colors (https://www.w3.org/TR/css-color-4/#named-colors)
const NAMED_COLORS = new Set([
    "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue",
    "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
    "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
    "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
    "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
    "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred",
    "indigo", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
    "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
    "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime",
    "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
    "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
    "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
    "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip",
    "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue",
    "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue",
    "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "turquoise",
    "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"
]);

/**
 * Normalizes a color from projects.json: a CSS color name (`red`) or a hex value (`#bb0000` / `#b00`).
 * Returns a lowercase name or a 6 digit hex (`#bb0000`), or `undefined` when the color is not valid.
 */
export function normalizeColor(color: string | undefined): string | undefined {
    if (typeof color !== "string") {
        return undefined;
    }
    const value = color.trim().toLowerCase();
    if (HEX_COLOR.test(value)) {
        return value.length === 4
            ? "#" + value[ 1 ] + value[ 1 ] + value[ 2 ] + value[ 2 ] + value[ 3 ] + value[ 3 ]
            : value;
    }
    return NAMED_COLORS.has(value) ? value : undefined;
}

function escapeXml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Writes (once) a generated icon to the extension global storage and returns its Uri */
function getGeneratedIconUri(fileName: string, createContent: () => string | undefined): Uri | undefined {
    try {
        const iconsDir = path.join(Container.context.globalStorageUri.fsPath, "project-icons");
        const filePath = path.join(iconsDir, fileName);
        if (!fs.existsSync(filePath)) {
            const content = createContent();
            if (content === undefined) {
                return undefined;
            }
            fs.mkdirSync(iconsDir, { recursive: true });
            fs.writeFileSync(filePath, content, "utf8");
        }
        return Uri.file(filePath);
    } catch (error) {
        console.log(error);
        return undefined;
    }
}

function getEmojiIconUri(emoji: string): Uri | undefined {
    return getGeneratedIconUri(Buffer.from(emoji, "utf8").toString("hex") + ".svg", () =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">`
        + `<text x="8" y="8" font-size="13" text-anchor="middle" dominant-baseline="central">${escapeXml(emoji)}</text>`
        + `</svg>`);
}

/**
 * Returns a codicon painted with the given (normalized) color, generated from the codicon SVGs
 * copied to `dist/codicons` at build time. Falls back to the plain ThemeIcon if the codicon is unknown.
 */
function getColoredCodicon(name: string, color: string): ThemeIcon | Uri {
    const uri = getGeneratedIconUri(`codicon-${name}-${color.replace("#", "")}.svg`, () => {
        const source = path.join(Container.context.extensionUri.fsPath, "dist", "codicons", `${name}.svg`);
        if (!fs.existsSync(source)) {
            return undefined;
        }
        return fs.readFileSync(source, "utf8").replace(/currentColor/g, color);
    });
    return uri ?? new ThemeIcon(name);
}

function getCodicon(name: string, color: string | undefined): ThemeIcon | Uri {
    return color ? getColoredCodicon(name, color) : new ThemeIcon(name);
}

/**
 * Applies a custom color to an already resolved default icon, when it is a codicon.
 * Other kinds of icons (images) are returned untouched.
 */
export function colorizeIcon(icon: string | IconPath, color: string | undefined): string | IconPath {
    const normalized = normalizeColor(color);
    if (!normalized || !(icon instanceof ThemeIcon)) {
        return icon;
    }
    return getColoredCodicon(icon.id.replace(/~.*$/, ""), normalized);
}

/**
 * Resolves the custom `icon` field of a project (from projects.json) into a TreeItem icon.
 *
 * Supported values:
 * - Codicon: `$(rocket)` or `rocket` (can be painted using the `color` field)
 * - Image file: path to a `.svg` or `.png` (absolute, `~`/`$home` based, or relative to the projects.json folder)
 * - Emoji (or any other short text): rendered into a generated SVG
 *
 * Returns `undefined` when the value can't be resolved, so the caller can fall back to the default icon.
 */
export function resolveCustomProjectIcon(icon: string | undefined, baseDir: string, color?: string): ThemeIcon | Uri | undefined {
    if (!icon) {
        return undefined;
    }
    const value = icon.trim();
    if (value === "") {
        return undefined;
    }
    const normalizedColor = normalizeColor(color);

    const codicon = CODICON_WITH_SYNTAX.exec(value);
    if (codicon) {
        return getCodicon(codicon[ 1 ], normalizedColor);
    }

    if (IMAGE_FILE.test(value)) {
        let iconPath = PathUtils.expandHomePath(value);
        if (!path.isAbsolute(iconPath)) {
            iconPath = path.resolve(baseDir, iconPath);
        }
        return fs.existsSync(iconPath) ? Uri.file(iconPath) : undefined;
    }

    if (CODICON_BARE.test(value)) {
        return getCodicon(value, normalizedColor);
    }

    return getEmojiIconUri(value);
}
