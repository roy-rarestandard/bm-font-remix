const test = require("node:test");
const assert = require("node:assert/strict");

const manifest = require("../manifest.json");

test("development manifest is a Figma plugin manifest, not a widget manifest", () => {
  assert.equal(manifest.name, "BM FontMixer");
  assert.equal(Object.hasOwn(manifest, "containsWidget"), false);
  assert.equal(Object.hasOwn(manifest, "widgetApi"), false);
  assert.equal(manifest.documentAccess, "dynamic-page");
  assert.deepEqual(manifest.networkAccess, { allowedDomains: ["none"] });
  assert.equal(manifest.main, "dist/code.js");
  assert.equal(manifest.ui, "src/ui.html");
});
