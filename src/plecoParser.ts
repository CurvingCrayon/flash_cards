import type { Flashcard, ParsedPlecoDeck } from "./types";

const DEFAULT_CATEGORY = "Uncategorized";
const HANZI_CHARACTER_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;

function normalizeCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildCardId(lineNumber: number, hanzi: string, pinyin: string): string {
  return `${lineNumber}-${hanzi}-${pinyin}`.replace(/\s+/g, "-");
}

export function parsePlecoText(input: string): ParsedPlecoDeck {
  const cards: Flashcard[] = [];
  const errors: ParsedPlecoDeck["errors"] = [];
  let category = DEFAULT_CATEGORY;

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      return;
    }

    if (line.startsWith("//")) {
      category = normalizeCell(line.slice(2)) || DEFAULT_CATEGORY;
      return;
    }

    const parts = rawLine.split("\t");
    if (parts.length < 3) {
      errors.push({
        lineNumber,
        line: rawLine,
        message: "Expected Hanzi, Pinyin, and English separated by tabs.",
      });
      return;
    }

    const [hanziRaw, pinyinRaw, ...englishParts] = parts;
    const hanzi = normalizeCell(hanziRaw);
    const pinyin = normalizeCell(pinyinRaw);
    const english = normalizeCell(englishParts.join("\t"));

    if (!hanzi || !pinyin || !english) {
      errors.push({
        lineNumber,
        line: rawLine,
        message: "Hanzi, Pinyin, and English must all be present.",
      });
      return;
    }

    cards.push({
      id: buildCardId(lineNumber, hanzi, pinyin),
      hanzi,
      pinyin,
      english,
      category,
      lineNumber,
    });
  });

  return { cards, errors };
}

export function extractHanziCharacters(text: string): string[] {
  return Array.from(text).filter((character) => HANZI_CHARACTER_PATTERN.test(character));
}
