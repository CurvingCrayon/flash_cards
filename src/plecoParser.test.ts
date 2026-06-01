import { describe, expect, it } from "vitest";
import { extractHanziCharacters, parsePlecoText } from "./plecoParser";

describe("parsePlecoText", () => {
  it("parses Pleco rows under section headers", () => {
    const result = parsePlecoText("// term1/greetings\n你好\tni3 hao3\thello\n谢谢\txie4 xie5\tthanks");

    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toMatchObject({
      hanzi: "你好",
      pinyin: "ni3 hao3",
      english: "hello",
      category: "term1/greetings",
      lineNumber: 2,
    });
  });

  it("keeps extra tab content in the English definition", () => {
    const result = parsePlecoText("学校\txue2 xiao4\tschool\tacademy");

    expect(result.cards[0].english).toBe("school academy");
  });

  it("reports malformed rows without blocking valid cards", () => {
    const result = parsePlecoText("bad row\n朋友\tpeng2 you5\tfriend");

    expect(result.cards).toHaveLength(1);
    expect(result.errors).toEqual([
      {
        lineNumber: 1,
        line: "bad row",
        message: "Expected Hanzi, Pinyin, and English separated by tabs.",
      },
    ]);
  });

  it("ignores blank lines and hash comments", () => {
    const result = parsePlecoText("# exported notes\n\n中国\tzhong1 guo2\tChina");

    expect(result.errors).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].category).toBe("Uncategorized");
  });
});

describe("extractHanziCharacters", () => {
  it("returns only CJK characters", () => {
    expect(extractHanziCharacters("你好, ABC 学!" )).toEqual(["你", "好", "学"]);
  });
});
