// Summarize a V8 .cpuprofile: busy time, top functions by self time, and top
// app/React/Ink functions by inclusive time.
// usage: node bench/summarize-profile.mjs <file.cpuprofile>
import fs from "fs";

const profile = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);

const label = (n) => {
    const file = n.callFrame.url.replace(/^.*\/(node_modules\/)?/, "");
    return `${n.callFrame.functionName || "(anonymous)"} ${file}:${n.callFrame.lineNumber + 1}`;
};

const selfTime = new Map();
const inclusiveTime = new Map();
let total = 0;
let idle = 0;
for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const self = label(nodes.get(id));
    if (self.startsWith("(idle)")) idle += dt;
    selfTime.set(self, (selfTime.get(self) ?? 0) + dt);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        const l = label(nodes.get(cur));
        if (seen.has(l)) continue;
        seen.add(l);
        inclusiveTime.set(l, (inclusiveTime.get(l) ?? 0) + dt);
    }
}

const print = (times, count, filter) => {
    [...times]
        .filter(([l]) => !/^\((idle|root|program)\)/.test(l) && filter(l))
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .forEach(([l, t]) => console.log(`  ${(t / 1e3).toFixed(0).padStart(7)}ms  ${l}`));
};

console.log(`wall ${(total / 1e6).toFixed(2)}s, busy ${((total - idle) / 1e6).toFixed(2)}s`);
console.log("top self time:");
print(selfTime, 15, () => true);
console.log("top inclusive time (app code, React, Ink):");
print(inclusiveTime, 15, (l) => /qbterm\/dist|dist\/|ink\/build|react-reconciler/.test(l));
