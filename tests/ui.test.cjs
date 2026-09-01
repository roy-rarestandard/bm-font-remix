const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const uiPath = path.join(__dirname, "..", "src", "ui.html");
const ui = fs.readFileSync(uiPath, "utf8");

test("specialized UI script parses and keeps only BM controls", () => {
  const script = ui.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "inline UI script is present");
  assert.doesNotThrow(() => new Function(script));

  assert.match(ui, /<title>BM FontMixer<\/title>/);
  assert.match(ui, /id="weightControl"/);
  assert.match(ui, /id="fontAlert"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(ui, /data-weight="regular"/);
  assert.match(ui, /data-weight="semibold"/);
  assert.match(ui, /data-weight="bold"/);
  assert.match(ui, /data-weight="extrabold"/);
  assert.match(ui, /id="fontSizeInput"[^>]*value="40"/);
  assert.match(ui, /id="sizeRatioInput"[^>]*value="-5"/);
  assert.match(ui, /Missing \$\{noun\}: \$\{formatList\(missingFamilies\)\}/);
  assert.match(ui, /Some weights are unavailable\. Install:/);

  assert.doesNotMatch(ui, /presetSelect|save-preset|delete-preset/i);
  assert.doesNotMatch(ui, /fontASearch|fontBSearch|extractButton/);
  assert.doesNotMatch(ui, /letterSpacingLatin|letterSpacingKanji|letterSpacingHiragana|letterSpacingKatakana/);
});
