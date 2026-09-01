const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SETTINGS,
  JAPANESE_FAMILY,
  LATIN_FAMILY,
  WEIGHT_PROFILES,
  buildCharacterRanges,
  buildCharacterTokens,
  classifyCharacter,
  classifyJapaneseSubtype,
  createSettingsForWeight,
  emToFigmaPercent,
  figmaPercentToEm,
  getFontAvailability
} = require("../dist/core.js");

test("BM defaults use the fixed internal families, Regular pairing, and -5% size difference", () => {
  assert.equal(LATIN_FAMILY, "BM Duplet DSP");
  assert.equal(JAPANESE_FAMILY, "FOT-NewCezanne ProN");
  assert.deepEqual(DEFAULT_SETTINGS.fontA, { family: LATIN_FAMILY, style: "Regular" });
  assert.deepEqual(DEFAULT_SETTINGS.fontB, { family: JAPANESE_FAMILY, style: "M" });
  assert.equal(DEFAULT_SETTINGS.fontSize, 40);
  assert.equal(DEFAULT_SETTINGS.sizeRatio, -5);
  assert.equal(DEFAULT_SETTINGS.letterSpacingLatin, 0);
  assert.equal(DEFAULT_SETTINGS.letterSpacingKanji, 0.04);
  assert.equal(DEFAULT_SETTINGS.letterSpacingHiragana, 0.02);
  assert.equal(DEFAULT_SETTINGS.letterSpacingKatakana, 0.02);
});

test("weight profiles map to the four approved BM font pairings", () => {
  assert.deepEqual(
    WEIGHT_PROFILES.map(({ id, latinStyle, japaneseStyle }) => [id, latinStyle, japaneseStyle]),
    [
      ["regular", "Regular", "M"],
      ["semibold", "SemiBold", "DB"],
      ["bold", "Bold", "B"],
      ["extrabold", "ExtraBold", "EB"]
    ]
  );

  const extraBold = createSettingsForWeight("extrabold", 64, -8);
  assert.deepEqual(extraBold.fontA, { family: LATIN_FAMILY, style: "ExtraBold" });
  assert.deepEqual(extraBold.fontB, { family: JAPANESE_FAMILY, style: "EB" });
  assert.equal(extraBold.fontSize, 64);
  assert.equal(extraBold.sizeRatio, -8);
  assert.equal(extraBold.letterSpacingKanji, 0.04);
});

test("font availability distinguishes missing families from missing styles", () => {
  assert.deepEqual(getFontAvailability([]), {
    missingFamilies: [LATIN_FAMILY, JAPANESE_FAMILY],
    missingStyles: []
  });

  const partial = getFontAvailability([
    { family: LATIN_FAMILY, style: "Regular" },
    { family: JAPANESE_FAMILY, style: "M" }
  ]);
  assert.deepEqual(partial.missingFamilies, []);
  assert.deepEqual(partial.missingStyles, [
    `${LATIN_FAMILY} SemiBold`,
    `${LATIN_FAMILY} Bold`,
    `${LATIN_FAMILY} ExtraBold`,
    `${JAPANESE_FAMILY} DB`,
    `${JAPANESE_FAMILY} B`,
    `${JAPANESE_FAMILY} EB`
  ]);

  const complete = getFontAvailability([
    { family: LATIN_FAMILY, style: "Regular" },
    { family: LATIN_FAMILY, style: "Semibold" },
    { family: LATIN_FAMILY, style: "Bold" },
    { family: LATIN_FAMILY, style: "Extrabold" },
    { family: JAPANESE_FAMILY, style: "M" },
    { family: JAPANESE_FAMILY, style: "DB" },
    { family: JAPANESE_FAMILY, style: "B" },
    { family: JAPANESE_FAMILY, style: "EB" }
  ]);
  assert.deepEqual(complete, { missingFamilies: [], missingStyles: [] });
});

test("classifyCharacter separates latin and japanese ranges", () => {
  assert.equal(classifyCharacter("A".codePointAt(0)), "latin");
  assert.equal(classifyCharacter("あ".codePointAt(0)), "japanese");
  assert.equal(classifyCharacter("ア".codePointAt(0)), "japanese");
  assert.equal(classifyCharacter("東".codePointAt(0)), "japanese");
});

test("classifyJapaneseSubtype handles hiragana, katakana, and kanji", () => {
  assert.equal(classifyJapaneseSubtype("あ".codePointAt(0)), "hiragana");
  assert.equal(classifyJapaneseSubtype("ア".codePointAt(0)), "katakana");
  assert.equal(classifyJapaneseSubtype("ｨ".codePointAt(0)), "katakana");
  assert.equal(classifyJapaneseSubtype("東".codePointAt(0)), "kanji");
});

test("buildCharacterRanges keeps spaces with the preceding script and handles surrogate pairs", () => {
  assert.deepEqual(buildCharacterRanges("A あ"), [
    { start: 0, end: 2, script: "latin" },
    { start: 2, end: 3, script: "japanese" }
  ]);

  assert.deepEqual(buildCharacterRanges("A😀あ"), [
    { start: 0, end: 3, script: "latin" },
    { start: 3, end: 4, script: "japanese" }
  ]);
});

test("buildCharacterTokens assigns subtype and per-script spacing", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    letterSpacingLatin: -0.01,
    letterSpacingHiragana: -0.02,
    letterSpacingKatakana: -0.03,
    letterSpacingKanji: 0.04
  };

  const tokens = buildCharacterTokens("Aあア東", settings);
  assert.equal(tokens.length, 4);
  assert.equal(tokens[0].spacingBase, -0.01);
  assert.equal(tokens[1].japaneseSubtype, "hiragana");
  assert.equal(tokens[1].spacingBase, -0.02);
  assert.equal(tokens[2].japaneseSubtype, "katakana");
  assert.equal(tokens[2].spacingBase, -0.03);
  assert.equal(tokens[3].japaneseSubtype, "kanji");
  assert.equal(tokens[3].spacingBase, 0.04);
});

test("em spacing converts losslessly to and from Figma percent values", () => {
  assert.equal(DEFAULT_SETTINGS.letterSpacingUnit, "em");
  assert.equal(emToFigmaPercent(-0.05), -5);
  assert.equal(figmaPercentToEm(2.8), 0.028);
  assert.equal(figmaPercentToEm(emToFigmaPercent(-0.0125)), -0.0125);
});

test("default BM spacing is applied per script without a visible spacing form", () => {
  const tokens = buildCharacterTokens("A東あア", DEFAULT_SETTINGS);
  assert.deepEqual(
    tokens.map((token) => token.spacingBase),
    [0, 0.04, 0.02, 0.02]
  );
});
