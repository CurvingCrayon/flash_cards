import { describe, expect, it } from "vitest";
import { formatPinyinForDisplay } from "./pinyin";

describe("formatPinyinForDisplay", () => {
  it("converts tone-number Pinyin to accent marks", () => {
    expect(formatPinyinForDisplay("ni3 hao3 xie4 xie5")).toBe("nǐ hǎo xiè xie");
  });

  it("places tones according to standard vowel priority", () => {
    expect(formatPinyinForDisplay("zhong1 guo2 shui3 you3")).toBe("zhōng guó shuǐ yǒu");
  });

  it("supports ü written as v or u:", () => {
    expect(formatPinyinForDisplay("nv3 lu:4")).toBe("nǚ lǜ");
  });

  it("leaves already unnumbered text alone", () => {
    expect(formatPinyinForDisplay("nǐ hǎo / hello")).toBe("nǐ hǎo / hello");
  });
});
