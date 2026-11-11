/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// @ts-check
// Project editor form (Webview). Talks to src/projectEditor/projectEditor.ts using postMessage.

(function () {
    // eslint-disable-next-line no-undef
    const vscode = acquireVsCodeApi();

    const CODICON_WITH_SYNTAX = /^\$\(([a-z0-9-]+)(?:~[a-z]+)?\)$/;
    const CODICON_BARE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const IMAGE_FILE = /\.(svg|png)$/i;
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
    const NEW_FOLDER = "\u0000new";

    const EMOJIS = [
        "🚀", "⭐", "🔥", "💡", "📦", "🛠️", "⚙️", "🧪", "🐛", "📚", "📝", "📁", "🗂️", "💼", "🏠", "🏢",
        "🛒", "💳", "💰", "📈", "📊", "🎯", "🎨", "🎮", "🎵", "📷", "🎬", "🌐", "☁️", "🖥️", "💻", "📱",
        "🔒", "🔑", "🛡️", "🤖", "🧠", "⚡", "🌱", "🌍", "🍀", "🍎", "🍕", "☕", "🐳", "🐍", "🦀", "🐘",
        "🐧", "🦊", "🐱", "🐶", "🦄", "🐝", "❤️", "💙", "💚", "💛", "💜", "🧡", "🖤", "🤍", "✅", "❌",
        "⚠️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🏷️"
    ];

    /** @type {any} */
    let strings = {};
    /** @type {string[]} */
    let codicons = [];
    let codiconsBaseUri = "";
    /** @type {string[]} */
    let availableTags = [];
    /** @type {string[]} */
    let availableFolders = [];

    const state = {
        isNew: true,
        name: "",
        rootPath: "",
        /** @type {string[]} */
        paths: [],
        /** @type {string[]} */
        tags: [],
        enabled: true,
        profile: "",
        /** @type {"none" | "codicon" | "image" | "emoji"} */
        iconMode: "none",
        codicon: "",
        image: "",
        /** @type {string | undefined} */
        imageSrc: undefined,
        emoji: "",
        color: "",
        folderChoice: "",
        newFolder: ""
    };

    const app = /** @type {HTMLElement} */ (document.getElementById("app"));

    // ---------- helpers ----------

    /**
     * @param {string} tag
     * @param {Record<string, any>} [props]
     * @param {(Node | string | null | undefined | false)[]} [children]
     * @returns {any}
     */
    function h(tag, props, children) {
        const element = document.createElement(tag);
        for (const [ key, value ] of Object.entries(props || {})) {
            if (value === undefined || value === null || value === false) {
                continue;
            }
            if (key.startsWith("on")) {
                element.addEventListener(key.substring(2).toLowerCase(), value);
            } else if (key === "className") {
                element.className = value;
            } else if (key === "style" && typeof value === "object") {
                Object.assign(element.style, value);
            } else if (key in element && typeof value !== "string") {
                /** @type {any} */ (element)[ key ] = value;
            } else {
                element.setAttribute(key, value === true ? "" : String(value));
            }
        }
        for (const child of children || []) {
            if (child === null || child === undefined || child === false) {
                continue;
            }
            element.append(child);
        }
        return element;
    }

    /** Converts any CSS color (names included) into #rrggbb, or undefined if not valid */
    function toHex(color) {
        const value = (color || "").trim().toLowerCase();
        if (value === "") {
            return undefined;
        }
        if (HEX_COLOR.test(value)) {
            return value.length === 4
                ? "#" + value[ 1 ] + value[ 1 ] + value[ 2 ] + value[ 2 ] + value[ 3 ] + value[ 3 ]
                : value;
        }
        if (!/^[a-z]+$/.test(value)) {
            return undefined;
        }
        const context = document.createElement("canvas").getContext("2d");
        if (!context) {
            return undefined;
        }
        context.fillStyle = "#010203";
        context.fillStyle = value;
        const result = String(context.fillStyle);
        return result === "#010203" ? undefined : result;
    }

    function codiconStyle(name) {
        const url = `url("${codiconsBaseUri}/${name}.svg")`;
        return { webkitMaskImage: url, maskImage: url };
    }

    function getIconValue() {
        switch (state.iconMode) {
            case "codicon": return state.codicon ? `$(${state.codicon})` : "";
            case "image": return state.image.trim();
            case "emoji": return state.emoji.trim();
            default: return "";
        }
    }

    function getFolderValue() {
        return state.folderChoice === NEW_FOLDER ? state.newFolder.trim() : state.folderChoice;
    }

    function requestImagePreview() {
        state.imageSrc = undefined;
        if (IMAGE_FILE.test(state.image.trim())) {
            vscode.postMessage({ type: "imagePreview", value: state.image.trim() });
        }
    }

    // ---------- init ----------

    function init(message) {
        strings = message.strings;
        codicons = message.codicons;
        codiconsBaseUri = message.codiconsBaseUri;
        availableTags = message.tags;
        availableFolders = message.folders;

        const project = message.project;
        state.isNew = message.isNew;
        state.name = project.name || "";
        state.rootPath = project.rootPath || "";
        state.paths = [ ...(project.paths || []) ];
        state.tags = [ ...(project.tags || []) ];
        state.enabled = project.enabled !== false;
        state.profile = project.profile || "";
        state.color = project.color || "";

        const icon = (project.icon || "").trim();
        const codicon = CODICON_WITH_SYNTAX.exec(icon);
        if (icon === "") {
            state.iconMode = "none";
        } else if (codicon) {
            state.iconMode = "codicon";
            state.codicon = codicon[ 1 ];
        } else if (IMAGE_FILE.test(icon)) {
            state.iconMode = "image";
            state.image = icon;
        } else if (CODICON_BARE.test(icon)) {
            state.iconMode = "codicon";
            state.codicon = icon;
        } else {
            state.iconMode = "emoji";
            state.emoji = icon;
        }

        const folder = project.folder || "";
        if (folder !== "" && !availableFolders.includes(folder)) {
            availableFolders.push(folder);
        }
        state.folderChoice = folder;

        render();
        requestImagePreview();
        const nameInput = document.getElementById("name");
        if (nameInput) {
            nameInput.focus();
        }
    }

    // ---------- rendering ----------

    function field(label, id, content, hint, required) {
        return h("div", { className: "field" }, [
            h("label", { className: "field-label", for: id }, [
                label,
                required ? h("span", { className: "required", title: strings.required }, [ " *" ]) : null
            ]),
            content,
            hint ? h("div", { className: "hint" }, [ hint ]) : null
        ]);
    }

    function renderPreview() {
        const color = toHex(state.color);
        const preview = h("div", { className: "icon-preview", id: "icon-preview" });
        let iconElement;

        if (state.iconMode === "image" && state.imageSrc) {
            iconElement = h("img", { src: state.imageSrc, alt: "" });
        } else if (state.iconMode === "image") {
            iconElement = h("span", { className: "preview-missing", title: strings.iconImageNotFound }, [ "?" ]);
        } else if (state.iconMode === "emoji" && state.emoji.trim() !== "") {
            iconElement = h("span", { className: "preview-emoji" }, [ state.emoji.trim() ]);
        } else {
            const name = state.iconMode === "codicon" && state.codicon
                ? state.codicon
                : (state.rootPath.trim().endsWith(".code-workspace") ? "root-folder" : "folder");
            iconElement = h("span", { className: "codicon-mask large", style: codiconStyle(name) });
            if (color) {
                iconElement.style.backgroundColor = color;
            }
        }
        preview.append(iconElement);
        return preview;
    }

    function updatePreview() {
        const current = document.getElementById("icon-preview");
        if (current) {
            current.replaceWith(renderPreview());
        }
    }

    function renderRootPath() {
        const input = h("input", {
            id: "rootPath", type: "text", value: state.rootPath, spellcheck: "false",
            onInput: (event) => { state.rootPath = event.target.value; updatePreview(); }
        });
        return field(strings.rootPath, "rootPath", h("div", { className: "row" }, [
            input,
            h("button", { className: "secondary", onClick: () => vscode.postMessage({ type: "browse", target: "rootPath", mode: "folder", current: state.rootPath }) }, [ strings.folderButton ]),
            h("button", { className: "secondary", onClick: () => vscode.postMessage({ type: "browse", target: "rootPath", mode: "workspace", current: state.rootPath }) }, [ strings.workspaceButton ])
        ]), strings.rootPathHint, true);
    }

    function renderPaths() {
        const list = h("div", { className: "paths" });
        state.paths.forEach((value, index) => {
            list.append(h("div", { className: "row" }, [
                h("input", {
                    type: "text", value, spellcheck: "false",
                    onInput: (event) => { state.paths[ index ] = event.target.value; }
                }),
                h("button", { className: "secondary", onClick: () => vscode.postMessage({ type: "browse", target: "path", index, current: state.paths[ index ] || state.rootPath }) }, [ strings.browse ]),
                h("button", { className: "icon-button", title: strings.remove, "aria-label": strings.remove, onClick: () => { state.paths.splice(index, 1); render(); } }, [
                    h("span", { className: "codicon-mask", style: codiconStyle("close") })
                ])
            ]));
        });
        list.append(h("button", { className: "secondary add", onClick: () => { state.paths.push(""); render(); focusLast(".paths input"); } }, [
            h("span", { className: "codicon-mask", style: codiconStyle("add") }), strings.addPath
        ]));
        return field(strings.paths, "", list, strings.pathsHint, false);
    }

    function focusLast(selector) {
        const inputs = document.querySelectorAll(selector);
        if (inputs.length > 0) {
            /** @type {HTMLElement} */ (inputs[ inputs.length - 1 ]).focus();
        }
    }

    function addTag(tag) {
        const value = (tag || "").trim();
        if (value === "" || state.tags.includes(value)) {
            return;
        }
        state.tags.push(value);
        render();
        const input = document.getElementById("tags");
        if (input) {
            input.focus();
        }
    }

    function renderTags() {
        const chips = state.tags.map((tag, index) => h("span", { className: "chip" }, [
            tag,
            h("button", { className: "chip-remove", title: strings.remove, "aria-label": strings.remove, onClick: () => { state.tags.splice(index, 1); render(); } }, [ "×" ])
        ]));
        const input = h("input", {
            id: "tags", type: "text", list: "tags-list", placeholder: strings.tagsPlaceholder,
            onKeydown: (event) => {
                if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag(event.target.value);
                } else if (event.key === "Backspace" && event.target.value === "" && state.tags.length > 0) {
                    state.tags.pop();
                    render();
                    const tagsInput = document.getElementById("tags");
                    if (tagsInput) {
                        tagsInput.focus();
                    }
                }
            },
            onChange: (event) => {
                // selecting an option from the datalist
                if (availableTags.includes(event.target.value)) {
                    addTag(event.target.value);
                }
            }
        });
        const datalist = h("datalist", { id: "tags-list" }, availableTags.filter(tag => !state.tags.includes(tag)).map(tag => h("option", { value: tag })));
        const suggestions = availableTags.filter(tag => !state.tags.includes(tag));
        return field(strings.tags, "tags", h("div", {}, [
            h("div", { className: "tags-box" }, [ ...chips, input, datalist ]),
            suggestions.length > 0
                ? h("div", { className: "suggestions" }, suggestions.map(tag => h("button", { className: "suggestion", onClick: () => addTag(tag) }, [ "+ " + tag ])))
                : null
        ]), undefined, false);
    }

    function renderEnabled() {
        return h("div", { className: "field" }, [
            h("label", { className: "checkbox" }, [
                h("input", { type: "checkbox", checked: state.enabled, onChange: (event) => { state.enabled = event.target.checked; } }),
                strings.enabled
            ]),
            h("div", { className: "hint" }, [ strings.enabledHint ])
        ]);
    }

    function renderIcon() {
        const modes = [
            [ "none", strings.iconNone ],
            [ "codicon", strings.iconCodicon ],
            [ "image", strings.iconImage ],
            [ "emoji", strings.iconEmoji ]
        ];
        const tabs = h("div", { className: "tabs", role: "tablist" }, modes.map(([ mode, label ]) => h("button", {
            className: "tab" + (state.iconMode === mode ? " active" : ""),
            role: "tab",
            "aria-selected": state.iconMode === mode ? "true" : "false",
            onClick: () => { state.iconMode = /** @type {any} */ (mode); render(); }
        }, [ label ])));

        let body;
        switch (state.iconMode) {
            case "codicon":
                body = renderCodiconPicker();
                break;
            case "image":
                body = h("div", {}, [
                    h("div", { className: "row" }, [
                        h("input", {
                            id: "icon-image", type: "text", value: state.image, spellcheck: "false", placeholder: strings.iconImagePlaceholder,
                            onChange: (event) => { state.image = event.target.value; requestImagePreview(); updatePreview(); }
                        }),
                        h("button", { className: "secondary", onClick: () => vscode.postMessage({ type: "browse", target: "icon", current: state.image }) }, [ strings.browse ])
                    ]),
                    h("div", { className: "hint" }, [ strings.iconImageHint ])
                ]);
                break;
            case "emoji":
                body = h("div", {}, [
                    h("input", {
                        id: "icon-emoji", type: "text", value: state.emoji, className: "emoji-input", placeholder: strings.iconEmojiPlaceholder,
                        onInput: (event) => { state.emoji = event.target.value; updatePreview(); }
                    }),
                    h("div", { className: "emoji-grid" }, EMOJIS.map(emoji => h("button", {
                        className: "emoji" + (state.emoji.trim() === emoji ? " selected" : ""),
                        title: emoji,
                        onClick: () => { state.emoji = emoji; render(); }
                    }, [ emoji ])))
                ]);
                break;
            default:
                body = h("div", { className: "hint" }, [ strings.iconDefaultHint ]);
        }

        return field(strings.icon, "", h("div", { className: "icon-field" }, [
            renderPreview(),
            h("div", { className: "icon-editor" }, [ tabs, body ])
        ]), undefined, false);
    }

    let codiconFilter = "";

    function renderCodiconPicker() {
        const grid = h("div", { className: "codicon-grid", role: "listbox" });
        const fillGrid = () => {
            grid.textContent = "";
            const filter = codiconFilter.trim().toLowerCase();
            const names = filter === "" ? codicons : codicons.filter(name => name.includes(filter));
            if (names.length === 0) {
                grid.append(h("div", { className: "hint" }, [ strings.noIconsFound ]));
                return;
            }
            const color = toHex(state.color);
            for (const name of names) {
                const icon = h("span", { className: "codicon-mask", style: codiconStyle(name) });
                if (color) {
                    icon.style.backgroundColor = color;
                }
                const button = h("button", {
                    className: "codicon-option" + (state.codicon === name ? " selected" : ""),
                    title: name,
                    role: "option",
                    "aria-label": name
                }, [ icon ]);
                button.addEventListener("click", () => {
                    state.codicon = name;
                    grid.querySelectorAll(".selected").forEach(element => element.classList.remove("selected"));
                    button.classList.add("selected");
                    selected.textContent = `$(${name})`;
                    updatePreview();
                });
                grid.append(button);
            }
        };
        const selected = h("code", { className: "selected-codicon" }, [ state.codicon ? `$(${state.codicon})` : "" ]);
        const search = h("input", {
            type: "search", value: codiconFilter, placeholder: strings.iconSearch,
            onInput: (event) => { codiconFilter = event.target.value; fillGrid(); }
        });
        fillGrid();
        setTimeout(() => {
            const selectedButton = grid.querySelector(".selected");
            if (selectedButton) {
                selectedButton.scrollIntoView({ block: "nearest" });
            }
        }, 0);
        return h("div", {}, [ h("div", { className: "row" }, [ search, selected ]), grid ]);
    }

    function renderColor() {
        const hex = toHex(state.color);
        const picker = h("input", {
            type: "color", value: hex || "#808080", className: hex ? "" : "empty", title: strings.color,
            onInput: (event) => {
                state.color = event.target.value;
                text.value = state.color;
                picker.classList.remove("empty");
                updateColor();
            }
        });
        const text = h("input", {
            type: "text", value: state.color, placeholder: strings.colorPlaceholder, spellcheck: "false", className: "color-text",
            onInput: (event) => {
                state.color = event.target.value;
                const value = toHex(state.color);
                picker.value = value || "#808080";
                picker.classList.toggle("empty", !value);
                updateColor();
            }
        });
        return field(strings.color, "", h("div", { className: "row" }, [
            picker,
            text,
            h("button", { className: "secondary", onClick: () => { state.color = ""; render(); } }, [ strings.clear ])
        ]), strings.colorHint, false);
    }

    function updateColor() {
        updatePreview();
        const color = toHex(state.color);
        document.querySelectorAll(".codicon-grid .codicon-mask").forEach(element => {
            /** @type {HTMLElement} */ (element).style.backgroundColor = color || "";
        });
    }

    function renderFolder() {
        const select = h("select", {
            id: "folder",
            onChange: (event) => {
                state.folderChoice = event.target.value;
                render();
                if (state.folderChoice === NEW_FOLDER) {
                    const input = document.getElementById("new-folder");
                    if (input) {
                        input.focus();
                    }
                }
            }
        }, [
            h("option", { value: "" }, [ strings.folderNone ]),
            ...availableFolders.map(folder => h("option", { value: folder }, [ folder.split("/").join(" / ") ])),
            h("option", { value: NEW_FOLDER }, [ strings.folderNew ])
        ]);
        select.value = state.folderChoice;
        return field(strings.folder, "folder", h("div", {}, [
            select,
            state.folderChoice === NEW_FOLDER
                ? h("input", {
                    id: "new-folder", type: "text", value: state.newFolder, placeholder: strings.folderNewPlaceholder, className: "new-folder",
                    onInput: (event) => { state.newFolder = event.target.value; }
                })
                : null
        ]), strings.folderHint, false);
    }

    function render() {
        const active = document.activeElement;
        const activeId = active && active.id;

        app.textContent = "";
        app.append(
            h("h1", {}, [ state.isNew ? strings.newProject : strings.editProject ]),
            h("div", { id: "error", className: "error", role: "alert", hidden: true }),
            field(strings.name, "name", h("input", {
                id: "name", type: "text", value: state.name, placeholder: strings.namePlaceholder,
                onInput: (event) => { state.name = event.target.value; }
            }), undefined, true),
            renderRootPath(),
            renderPaths(),
            renderTags(),
            renderEnabled(),
            renderIcon(),
            renderColor(),
            renderFolder(),
            field(strings.profile, "profile", h("input", {
                id: "profile", type: "text", value: state.profile, placeholder: strings.profilePlaceholder,
                onInput: (event) => { state.profile = event.target.value; }
            }), undefined, false),
            h("div", { className: "actions" }, [
                h("button", { className: "primary", onClick: save }, [ strings.save ]),
                h("button", { className: "secondary", onClick: () => vscode.postMessage({ type: "cancel" }) }, [ strings.cancel ])
            ])
        );

        if (activeId) {
            const element = document.getElementById(activeId);
            if (element) {
                element.focus();
            }
        }
    }

    function showError(message) {
        const error = document.getElementById("error");
        if (!error) {
            return;
        }
        error.textContent = message;
        error.hidden = !message;
        if (message) {
            error.scrollIntoView({ block: "nearest" });
        }
    }

    function save() {
        // a tag typed but not confirmed with Enter is also saved
        const tagsInput = /** @type {HTMLInputElement | null} */ (document.getElementById("tags"));
        if (tagsInput && tagsInput.value.trim() !== "" && !state.tags.includes(tagsInput.value.trim())) {
            state.tags.push(tagsInput.value.trim());
        }
        showError("");
        vscode.postMessage({
            type: "save",
            project: {
                name: state.name,
                rootPath: state.rootPath,
                paths: state.paths,
                tags: state.tags,
                enabled: state.enabled,
                profile: state.profile,
                icon: getIconValue(),
                color: state.color,
                folder: getFolderValue()
            }
        });
    }

    // ---------- messages from the extension ----------

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "init":
                init(message);
                break;
            case "browseResult":
                if (message.target === "rootPath") {
                    state.rootPath = message.value;
                    if (state.name.trim() === "") {
                        state.name = message.value.split(/[\\/]/).filter(Boolean).pop().replace(/\.code-workspace$/, "");
                    }
                } else if (message.target === "path") {
                    state.paths[ message.index ] = message.value;
                } else if (message.target === "icon") {
                    state.image = message.value;
                    requestImagePreview();
                }
                render();
                break;
            case "imagePreview":
                if (message.value === state.image.trim()) {
                    state.imageSrc = message.src;
                    updatePreview();
                }
                break;
            case "error":
                showError(message.message);
                break;
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            save();
        }
    });

    vscode.postMessage({ type: "ready" });
}());
