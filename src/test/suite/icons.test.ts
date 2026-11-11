/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import { normalizeColor } from "../../utils/icons";

suite("Icons", () => {

    test("normalizeColor accepts CSS color names (case-insensitive)", () => {
        assert.strictEqual(normalizeColor("red"), "red");
        assert.strictEqual(normalizeColor(" Blue "), "blue");
        assert.strictEqual(normalizeColor("rebeccapurple"), "rebeccapurple");
    });

    test("normalizeColor accepts hex colors and expands the short form", () => {
        assert.strictEqual(normalizeColor("#bb0000"), "#bb0000");
        assert.strictEqual(normalizeColor("#BB0000"), "#bb0000");
        assert.strictEqual(normalizeColor("#b00"), "#bb0000");
        assert.strictEqual(normalizeColor("#1aF"), "#11aaff");
    });

    test("normalizeColor rejects invalid colors", () => {
        assert.strictEqual(normalizeColor(undefined), undefined);
        assert.strictEqual(normalizeColor(""), undefined);
        assert.strictEqual(normalizeColor("notacolor"), undefined);
        assert.strictEqual(normalizeColor("#bb00"), undefined);
        assert.strictEqual(normalizeColor("bb0000"), undefined);
        assert.strictEqual(normalizeColor("#gg0000"), undefined);
        assert.strictEqual(normalizeColor("red\" onload=\"x"), undefined);
    });
});
