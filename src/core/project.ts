/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

export interface Project {
    name: string;     // the name that the user defines for the project
    rootPath: string; // the root path of this project
    paths: string[];  // the 'other paths' when you have multifolder project
    tags: string[];   // the tags associated to the project
    enabled: boolean; // the project should be displayed in the project list
    profile: string;  // the profile to assign to the project
    icon?: string;    // optional custom icon: codicon ($(name) or name), path to .svg/.png, or emoji
    color?: string;   // optional icon color (codicons only): CSS color name or hex (#bb0000 / #b00)
    folder?: string;  // optional folder (Side Bar), subfolders separated by "/" (e.g. "Work/Clients")
}

/**
 * Normalizes the `folder` field of a project: splits by "/", trims each segment and drops empty ones.
 * Returns `undefined` when there is no folder (the project is shown at the root).
 */
export function normalizeFolder(folder: unknown): string | undefined {
    if (typeof folder !== "string") {
        return undefined;
    }
    const segments = folder.split("/").map(segment => segment.trim()).filter(segment => segment !== "");
    return segments.length > 0 ? segments.join("/") : undefined;
}

/**
 * Returns a clean copy of a project: trims texts, drops empty paths/tags (and duplicated tags),
 * and only keeps the optional fields (icon, color, folder) when they have a value.
 */
export function sanitizeProject(project: Project): Project {
    const trimmed = (value: unknown): string => typeof value === "string" ? value.trim() : "";
    const icon = trimmed(project.icon);
    const color = trimmed(project.color);
    const folder = normalizeFolder(project.folder);
    return {
        name: trimmed(project.name),
        rootPath: trimmed(project.rootPath),
        paths: (project.paths ?? []).map(trimmed).filter(item => item !== ""),
        tags: [ ...new Set((project.tags ?? []).map(trimmed).filter(item => item !== "")) ],
        enabled: project.enabled !== false,
        profile: trimmed(project.profile),
        ...(icon ? { icon } : {}),
        ...(color ? { color } : {}),
        ...(folder ? { folder } : {})
    };
}

export function createProject(name: string, rootPath: string): Project {

    const newProject: Project = {
        name,
        rootPath,
        paths: [],
        tags: [],
        enabled: true,
        profile: ""
    };
    return newProject;
}
