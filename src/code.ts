type ScriptType = "latin" | "japanese";
type JapaneseSubtype = "hiragana" | "katakana" | "kanji";
type WeightId = "regular" | "semibold" | "bold" | "extrabold";

type FontDescriptor = FontName;

type SavedSettings = {
  fontA: FontDescriptor;
  fontB: FontDescriptor;
  fontSize: number;
  sizeRatio: number;
  letterSpacingUnit: "em";
  letterSpacingLatin: number;
  letterSpacingKanji: number;
  letterSpacingHiragana: number;
  letterSpacingKatakana: number;
};

type UserSettings = {
  version: 2;
  weight: WeightId;
  fontSize: number;
  sizeRatio: number;
};

type CharacterRange = { start: number; end: number; script: ScriptType };
type CharacterToken = {
  start: number;
  end: number;
  codePoint: number;
  script: ScriptType;
  japaneseSubtype: JapaneseSubtype | null;
  spacingBase: number;
};

type WeightProfile = {
  id: WeightId;
  label: string;
  latinStyles: readonly string[];
  japaneseStyles: readonly string[];
};

type ResolvedWeight = {
  id: WeightId;
  label: string;
  available: boolean;
  fontA: FontDescriptor | null;
  fontB: FontDescriptor | null;
  missing: string[];
};

type PluginMessage =
  | { type: "init" }
  | { type: "apply"; weight?: unknown; fontSize?: unknown; sizeRatio?: unknown }
  | { type: "resize-ui"; height?: number }
  | { type: "close" };

const LATIN_FAMILY = "BM Duplet DSP";
const JAPANESE_FAMILY = "FOT-NewCezanne ProN";
const STORAGE_SETTINGS_KEY = "bm-font-mixer.settings";
const sessionStorageFallback = new Map<string, unknown>();
const PLUGIN_UI_WIDTH = 320;

const WEIGHT_PROFILES: readonly WeightProfile[] = [
  { id: "regular", label: "Regular", latinStyles: ["Regular"], japaneseStyles: ["M"] },
  { id: "semibold", label: "SemiBold", latinStyles: ["SemiBold", "Semibold"], japaneseStyles: ["DB"] },
  { id: "bold", label: "Bold", latinStyles: ["Bold"], japaneseStyles: ["B"] },
  { id: "extrabold", label: "ExtraBold", latinStyles: ["ExtraBold", "Extrabold"], japaneseStyles: ["EB"] }
];

const DEFAULT_USER_SETTINGS: UserSettings = {
  version: 2,
  weight: "regular",
  fontSize: 40,
  sizeRatio: -5
};

figma.showUI(__html__, { width: PLUGIN_UI_WIDTH, height: 340 });

function classifyCharacter(code: number): ScriptType {
  if (code >= 0x0020 && code <= 0x024f) return "latin";
  const isJapanese =
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x3000 && code <= 0x303f);
  return isJapanese ? "japanese" : "latin";
}

function classifyJapaneseSubtype(code: number): JapaneseSubtype {
  if (code >= 0x3040 && code <= 0x309f) return "hiragana";
  if ((code >= 0x30a0 && code <= 0x30ff) || (code >= 0xff65 && code <= 0xff9f)) return "katakana";
  return "kanji";
}

function isWhitespace(codePoint: number): boolean {
  return /\s/u.test(String.fromCodePoint(codePoint));
}

function buildCharacterRanges(text: string): CharacterRange[] {
  const ranges: CharacterRange[] = [];
  if (!text.length) return ranges;
  let index = 0;
  let rangeStart = 0;
  let currentScript: ScriptType | null = null;
  let previousScript: ScriptType = "latin";
  while (index < text.length) {
    const codePoint = text.codePointAt(index);
    if (codePoint == null) break;
    const resolvedScript: ScriptType =
      isWhitespace(codePoint) && index > 0 ? previousScript : classifyCharacter(codePoint);
    if (currentScript == null) {
      currentScript = resolvedScript;
      rangeStart = index;
    } else if (resolvedScript !== currentScript) {
      ranges.push({ start: rangeStart, end: index, script: currentScript });
      currentScript = resolvedScript;
      rangeStart = index;
    }
    previousScript = resolvedScript;
    index += codePoint > 0xffff ? 2 : 1;
  }
  if (currentScript != null) ranges.push({ start: rangeStart, end: text.length, script: currentScript });
  return ranges;
}

function getLetterSpacingForChar(script: ScriptType, codePoint: number, settings: SavedSettings): number {
  if (script === "latin") return settings.letterSpacingLatin;
  const subtype = classifyJapaneseSubtype(codePoint);
  if (subtype === "hiragana") return settings.letterSpacingHiragana;
  if (subtype === "katakana") return settings.letterSpacingKatakana;
  return settings.letterSpacingKanji;
}

function buildCharacterTokens(text: string, settings: SavedSettings): CharacterToken[] {
  const tokens: CharacterToken[] = [];
  let index = 0;
  let previousScript: ScriptType = "latin";
  while (index < text.length) {
    const codePoint = text.codePointAt(index);
    if (codePoint == null) break;
    const resolvedScript: ScriptType =
      isWhitespace(codePoint) && index > 0 ? previousScript : classifyCharacter(codePoint);
    const japaneseSubtype = resolvedScript === "japanese" ? classifyJapaneseSubtype(codePoint) : null;
    const end = index + (codePoint > 0xffff ? 2 : 1);
    tokens.push({
      start: index,
      end,
      codePoint,
      script: resolvedScript,
      japaneseSubtype,
      spacingBase: getLetterSpacingForChar(resolvedScript, codePoint, settings)
    });
    previousScript = resolvedScript;
    index = end;
  }
  return tokens;
}

async function loadAllFontsOnNode(node: TextNode): Promise<void> {
  const loaded = new Set<string>();
  for (const segment of node.getStyledTextSegments(["fontName"])) {
    const key = `${segment.fontName.family}:::${segment.fontName.style}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    try {
      await figma.loadFontAsync(segment.fontName);
    } catch (error) {
      throw new Error(`Failed to load existing font "${segment.fontName.family} ${segment.fontName.style}".`);
    }
  }
}

function applyBatchedLetterSpacing(node: TextNode, tokens: CharacterToken[], values: number[]): void {
  if (!tokens.length) return;
  let batchStart = tokens[0].start;
  let batchEnd = tokens[0].end;
  let currentValue = values[0];
  const write = () =>
    node.setRangeLetterSpacing(batchStart, batchEnd, {
      unit: "PERCENT",
      value: Number((currentValue * 100).toFixed(3))
    });

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = values[index];
    if (token.start === batchEnd && Math.abs(value - currentValue) < 0.0001) {
      batchEnd = token.end;
      continue;
    }
    write();
    batchStart = token.start;
    batchEnd = token.end;
    currentValue = value;
  }
  write();
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findFont(fonts: Font[], family: string, allowedStyles: readonly string[]): FontDescriptor | null {
  const normalizedFamily = normalizeName(family);
  const normalizedStyles = allowedStyles.map(normalizeName);
  return (
    fonts.find(
      (font) =>
        normalizeName(font.fontName.family) === normalizedFamily &&
        normalizedStyles.includes(normalizeName(font.fontName.style))
    )?.fontName ?? null
  );
}

function resolveWeightProfile(profile: WeightProfile, fonts: Font[]): ResolvedWeight {
  const fontA = findFont(fonts, LATIN_FAMILY, profile.latinStyles);
  const fontB = findFont(fonts, JAPANESE_FAMILY, profile.japaneseStyles);
  const missing: string[] = [];
  if (!fontA) missing.push(`${LATIN_FAMILY} ${profile.latinStyles.join(" or ")}`);
  if (!fontB) missing.push(`${JAPANESE_FAMILY} ${profile.japaneseStyles.join(" or ")}`);
  return { id: profile.id, label: profile.label, available: Boolean(fontA && fontB), fontA, fontB, missing };
}

function resolveAllWeights(fonts: Font[]): ResolvedWeight[] {
  return WEIGHT_PROFILES.map((profile) => resolveWeightProfile(profile, fonts));
}

function isWeightId(value: unknown): value is WeightId {
  return WEIGHT_PROFILES.some((profile) => profile.id === value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeUserSettings(raw: Partial<UserSettings> | undefined): UserSettings {
  const source = raw ?? {};
  return {
    version: 2,
    weight: isWeightId(source.weight) ? source.weight : DEFAULT_USER_SETTINGS.weight,
    fontSize: clamp(toFiniteNumber(source.fontSize, DEFAULT_USER_SETTINGS.fontSize), 1, 420),
    sizeRatio: clamp(toFiniteNumber(source.sizeRatio, DEFAULT_USER_SETTINGS.sizeRatio), -30, 30)
  };
}

function buildFixedSettings(user: UserSettings, resolved: ResolvedWeight): SavedSettings {
  if (!resolved.fontA || !resolved.fontB) {
    throw new Error(`Missing required fonts: ${resolved.missing.join(", ")}.`);
  }
  return {
    fontA: resolved.fontA,
    fontB: resolved.fontB,
    fontSize: user.fontSize,
    sizeRatio: user.sizeRatio,
    letterSpacingUnit: "em",
    letterSpacingLatin: 0,
    letterSpacingKanji: 0.04,
    letterSpacingHiragana: 0.02,
    letterSpacingKatakana: 0.02
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "An unexpected error occurred.";
}

function isClientStoragePluginIdError(error: unknown): boolean {
  const message = formatError(error);
  return (
    message.includes("Cannot access client storage without a plugin ID") ||
    message.includes("Cannot set private plugin data in a plugin without an ID") ||
    message.includes("Cannot access private plugin data in a plugin without an ID")
  );
}

async function getStoredValue<T>(key: string): Promise<T | null> {
  try {
    const stored = await figma.clientStorage.getAsync(key);
    return stored == null ? null : (stored as T);
  } catch (error) {
    if (!isClientStoragePluginIdError(error)) throw error;
    return sessionStorageFallback.has(key) ? (sessionStorageFallback.get(key) as T) : null;
  }
}

async function setStoredValue(key: string, value: unknown): Promise<void> {
  try {
    await figma.clientStorage.setAsync(key, value);
  } catch (error) {
    if (!isClientStoragePluginIdError(error)) throw error;
    sessionStorageFallback.set(key, value);
  }
}

async function getSavedSettings(): Promise<UserSettings> {
  const stored = await getStoredValue<Partial<UserSettings>>(STORAGE_SETTINGS_KEY);
  if (!stored || typeof stored !== "object" || stored.version !== 2) return DEFAULT_USER_SETTINGS;
  return normalizeUserSettings(stored);
}

async function setSavedSettings(settings: UserSettings): Promise<void> {
  await setStoredValue(STORAGE_SETTINGS_KEY, settings);
}

async function applyFontMix(node: TextNode, settings: SavedSettings): Promise<void> {
  await loadAllFontsOnNode(node);
  for (const font of [settings.fontA, settings.fontB]) {
    try {
      await figma.loadFontAsync(font);
    } catch (error) {
      throw new Error(`Failed to load required font "${font.family} ${font.style}".`);
    }
  }

  const text = node.characters;
  if (!text.length) throw new Error("Text is empty.");
  const japaneseSize = settings.fontSize * (1 + settings.sizeRatio / 100);
  for (const range of buildCharacterRanges(text)) {
    node.setRangeFontName(range.start, range.end, range.script === "latin" ? settings.fontA : settings.fontB);
    node.setRangeFontSize(range.start, range.end, range.script === "latin" ? settings.fontSize : japaneseSize);
  }
  const tokens = buildCharacterTokens(text, settings);
  applyBatchedLetterSpacing(node, tokens, tokens.map((token) => token.spacingBase));
}

function getTextNodeCharacters(node: TextNode): string | null {
  try {
    return node.characters;
  } catch (error) {
    return null;
  }
}

function getSelectionInfo(): { message: string } {
  const selection = figma.currentPage.selection;
  if (!selection.length) return { message: "No layer selected. Choose one text node." };
  if (selection.length > 1) return { message: "Multiple layers selected. Select exactly one text node." };
  const node = selection[0];
  if (node.type !== "TEXT") return { message: `Selected layer "${node.name}" is not a text node.` };
  const characters = getTextNodeCharacters(node);
  return characters == null
    ? { message: `Selected text node: "${node.name}"` }
    : { message: `Selected text node: "${node.name}" (${characters.length} chars)` };
}

function getSingleSelectedTextNode(): TextNode | null | "multiple" | "non-text" {
  const selection = figma.currentPage.selection;
  if (!selection.length) return null;
  if (selection.length > 1) return "multiple";
  return selection[0].type === "TEXT" ? selection[0] : "non-text";
}

function postMessage(message: object): void {
  figma.ui.postMessage(message);
}

function postStatus(kind: "success" | "error" | "warning" | "info", message: string): void {
  postMessage({ type: "status", kind, message });
}

async function sendInitPayload(): Promise<void> {
  const [fontsResult, savedSettingsResult] = await Promise.all([
    figma.listAvailableFontsAsync().then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getSavedSettings().then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error }))
  ]);
  const fonts = fontsResult.ok ? fontsResult.value : [];
  const savedSettings = savedSettingsResult.ok ? savedSettingsResult.value : DEFAULT_USER_SETTINGS;
  postMessage({ type: "init", weights: resolveAllWeights(fonts), savedSettings, selectionInfo: getSelectionInfo() });
  if (!fontsResult.ok) postStatus("warning", "Could not check the required fonts. Try reopening the plugin.");
  else if (!savedSettingsResult.ok) postStatus("warning", "Saved sizing settings could not be restored.");
}

async function handleApply(message: Extract<PluginMessage, { type: "apply" }>): Promise<void> {
  const userSettings = normalizeUserSettings({
    version: 2,
    weight: isWeightId(message.weight) ? message.weight : DEFAULT_USER_SETTINGS.weight,
    fontSize: toFiniteNumber(message.fontSize, DEFAULT_USER_SETTINGS.fontSize),
    sizeRatio: toFiniteNumber(message.sizeRatio, DEFAULT_USER_SETTINGS.sizeRatio)
  });
  const selected = getSingleSelectedTextNode();
  if (selected == null) return postStatus("error", "No selection. Select a single text node.");
  if (selected === "multiple") return postStatus("error", "Multiple layers selected. Select exactly one text node.");
  if (selected === "non-text") return postStatus("error", "Selected layer is not a text node.");
  const characters = getTextNodeCharacters(selected);
  if (characters == null) return postStatus("error", "Could not read the selected text node.");
  if (!characters.trim()) return postStatus("warning", "Selected text node is empty.");

  const profile = WEIGHT_PROFILES.find((candidate) => candidate.id === userSettings.weight) ?? WEIGHT_PROFILES[0];
  const resolved = resolveWeightProfile(profile, await figma.listAvailableFontsAsync());
  if (!resolved.available) return postStatus("error", `Missing required fonts: ${resolved.missing.join(", ")}.`);
  await applyFontMix(selected, buildFixedSettings(userSettings, resolved));
  await setSavedSettings(userSettings);
  postStatus("success", `${resolved.label} font mix applied.`);
}

figma.ui.onmessage = async (message: PluginMessage) => {
  try {
    if (message.type === "init") await sendInitPayload();
    else if (message.type === "apply") await handleApply(message);
    else if (message.type === "resize-ui") {
      const height = Number(message.height);
      if (Number.isFinite(height)) figma.ui.resize(PLUGIN_UI_WIDTH, Math.max(260, Math.min(700, Math.round(height))));
    } else if (message.type === "close") figma.closePlugin();
    else postStatus("error", "Unknown message received.");
  } catch (error) {
    postStatus("error", formatError(error));
  }
};

figma.on("selectionchange", () => postMessage({ type: "selection-info", ...getSelectionInfo() }));
