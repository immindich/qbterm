// Tests for search matching (search.ts). Run with `npm run test:unit`, which builds first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compact, parseQuery, matches } from "../search.js";

const cases: [name: string, query: string, shouldMatch: boolean][] = [
    ["Big.Buck.Bunny.2008.1080p", "big buck", true],
    ["Big.Buck.Bunny.2008.1080p", "bigbuck", true],
    ["Big.Buck.Bunny.2008.1080p", "buck big", true],
    ["Big.Buck.Bunny.2008.1080p", "big-buck", true],
    ["Big.Buck.Bunny.2008.1080p", "BIG BUCK", true],
    ["Big.Buck.Bunny.2008.1080p", "bunny 1080", true],
    ["Big.Buck.Bunny.2008.1080p", "bunny 720", false],
    ["big_buck_bunny_4k", "big buck bunny", true],
    ["BigBuckBunny (2008)", "buck bunny 2008", true],
    ["ubuntu-26.04.1-desktop-amd64.iso", "26.04", true],
    ["ubuntu-26.04.1-desktop-amd64.iso", "ubuntu 2604", true],
    ["ubuntu-26.04.1-desktop-amd64.iso", "ubuntu 24.04", false],
    ["Amélie.2001.720p", "amelie", true],
    ["Amelie 2001", "amélie", true],
    ["The WIRED CD - Rip. Sample. Mash. Share.", "wired cd", true],
    ["The WIRED CD - Rip. Sample. Mash. Share.", "rip sample mash", true],
    ["Tears of Steel", "tearsofsteel", true],
    ["Tears of Steel", "steel tears", true],
    ["Tears of Steel", "tears of steal", false],
    ["Sintel", "sintel extra", false],
    ["Sintel", "sintelsintel", false],
];

for (const [name, query, expected] of cases) {
    test(`${JSON.stringify(query)} ${expected ? "matches" : "does not match"} ${JSON.stringify(name)}`, () => {
        assert.equal(matches(name, parseQuery(query)), expected);
    });
}

test("queries with no letters or digits have no terms", () => {
    for (const query of ["", "   ", "...", " - _ "]) {
        assert.deepEqual(parseQuery(query), [], JSON.stringify(query));
    }
});

test("compact folds case, accents, compatibility forms and separators but keeps other scripts", () => {
    assert.equal(compact("Ünïcödé — Ｆｕｌｌｗｉｄｔｈ ① 日本語.mkv"), "unicodefullwidth1日本語mkv");
});
