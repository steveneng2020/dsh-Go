// package.json's "files" decides what npm ships. A file left out still works from a
// checkout and only fails once installed, so walk the imports against the pack list.
//   node --test runtime/tests/bridge-package.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

const PACKAGES = [
  // The walk must have followed the graph, or it would pass with nothing to check.
  { name: "dsh-go-bridge", root: new URL("../bridge/dsh-go-bridge/", import.meta.url),
    reached: ["lib/session-deletion.js", "lib/native/core.js"] },
  { name: "dsh-composer-kit", root: new URL("../bridge/dsh-composer-kit/", import.meta.url),
    reached: ["lib/index.js", "lib/client.js"] },
];

function packedFiles(ROOT) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return new Set(JSON.parse(out)[0].files.map((file) => file.path));
}

function localImports(file, ROOT) {
  const text = readFileSync(new URL(file, ROOT), "utf8");
  const references = [...text.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*['"](\.[^'"]+)['"]/gm),
    ...text.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)];
  return references.map((match) =>
    posix.join(posix.dirname(file), match[1]),
  );
}

for (const { name, root, reached } of PACKAGES) {
  test(`${name} ships everything its entry points import`, () => {
    const { exports: entries } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    const queue = Object.values(entries).filter((target) => target.endsWith(".js")).map(posix.normalize);
    const packed = packedFiles(root);
    const seen = new Set();
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      assert.ok(packed.has(file), `${name}: ${file} is imported but missing from "files"`);
      queue.push(...localImports(file, root));
    }
    // The walk must have followed the graph, or it would pass with nothing to check.
    for (const file of reached) assert.ok(seen.has(file), `${name}: the walk never reached ${file}`);
  });
}
