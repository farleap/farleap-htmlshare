import { describe, it, expect } from "vitest";
import { reanchor } from "../src/lib/reanchor";

describe("reanchor (ADR-0005 matching rule)", () => {
  it("follows a unique prefix+exact+suffix match and reports exact's offsets", () => {
    const html = "<h1>Title</h1><p>The quick brown fox jumps</p>";
    const r = reanchor(html, { exact: "quick brown", prefix: "The ", suffix: " fox" });
    expect(r.kind).toBe("follow");
    if (r.kind === "follow") expect(html.slice(r.start, r.end)).toBe("quick brown");
  });

  it("follows an exact-only match when it is unique", () => {
    const html = "alpha BETA gamma";
    expect(reanchor(html, { exact: "BETA", prefix: null, suffix: null })).toEqual({
      kind: "follow",
      start: 6,
      end: 10,
    });
  });

  it("orphans when the quote is gone", () => {
    expect(reanchor("totally rewritten", { exact: "old text", prefix: null, suffix: null }).kind).toBe(
      "orphan",
    );
  });

  it("orphans an ambiguous exact-only match (appears more than once)", () => {
    expect(reanchor("foo bar foo", { exact: "foo", prefix: null, suffix: null }).kind).toBe("orphan");
  });

  it("uses context to disambiguate between two identical excerpts", () => {
    const html = "see foo here and foo there";
    const r = reanchor(html, { exact: "foo", prefix: "and ", suffix: " there" });
    expect(r.kind).toBe("follow");
    if (r.kind === "follow") {
      expect(html.slice(r.start, r.end)).toBe("foo");
      expect(r.start).toBe(html.lastIndexOf("foo")); // the second one
    }
  });

  it("orphans when there is no exact text to anchor to", () => {
    expect(reanchor("anything", { exact: null, prefix: "a", suffix: "b" }).kind).toBe("orphan");
    expect(reanchor("anything", { exact: "", prefix: null, suffix: null }).kind).toBe("orphan");
  });
});
