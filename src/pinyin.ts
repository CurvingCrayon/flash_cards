const TONE_MARKS: Record<string, readonly [string, string, string, string]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

function getToneTarget(syllable: string): number {
  const lower = syllable.toLowerCase();
  const aIndex = lower.indexOf("a");
  if (aIndex >= 0) return aIndex;

  const eIndex = lower.indexOf("e");
  if (eIndex >= 0) return eIndex;

  const ouIndex = lower.indexOf("ou");
  if (ouIndex >= 0) return ouIndex;

  const vowelMatches = [...lower.matchAll(/[aeiouü]/g)];
  return vowelMatches.at(-1)?.index ?? -1;
}

function preserveCase(original: string, marked: string): string {
  return original === original.toUpperCase() ? marked.toUpperCase() : marked;
}

function convertNumberedSyllable(syllable: string): string {
  const match = syllable.match(/^([A-Za-züÜ:vV]+)([1-5])(.*)$/);
  if (!match) return syllable;

  const [, rawBase, toneRaw, suffix] = match;
  const tone = Number(toneRaw);
  const normalizedBase = rawBase.replace(/u:/gi, "ü").replace(/v/gi, "ü");
  if (tone === 5) return `${normalizedBase}${suffix}`;

  const targetIndex = getToneTarget(normalizedBase);
  if (targetIndex < 0) return `${normalizedBase}${suffix}`;

  const target = normalizedBase[targetIndex];
  const marked = TONE_MARKS[target.toLowerCase()]?.[tone - 1];
  if (!marked) return `${normalizedBase}${suffix}`;

  return `${normalizedBase.slice(0, targetIndex)}${preserveCase(target, marked)}${normalizedBase.slice(targetIndex + 1)}${suffix}`;
}

export function formatPinyinForDisplay(pinyin: string): string {
  return pinyin
    .split(/(\s+)/)
    .map((part) => (part.trim() ? convertNumberedSyllable(part) : part))
    .join("");
}
