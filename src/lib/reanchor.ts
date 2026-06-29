// Re-anchoring for version-pinned comments (ADR-0005). When a new version is
// uploaded, each unresolved comment's stored quote is searched for in the new
// HTML. The cardinal rule: NEVER silently point a comment at the wrong place.
// So a comment only follows to the new version when its `prefix+exact+suffix`
// quote matches exactly once; a missing or ambiguous (multi-hit) match parks it
// as `orphaned` instead, preserving the original excerpt for manual re-linking.

export type Anchor = {
  exact: string | null;
  prefix: string | null;
  suffix: string | null;
};

export type Reanchored =
  | { kind: "follow"; start: number; end: number }
  | { kind: "orphan" };

// Find the comment's anchor in `html`. `start`/`end` are the offsets of `exact`
// within the new HTML (the prefix/suffix only disambiguate, they aren't part of
// the highlighted range). A comment with no `exact` has nothing to anchor to and
// is left for the caller to skip — it is not an orphan, it simply isn't inline.
export function reanchor(html: string, a: Anchor): Reanchored {
  const exact = a.exact ?? "";
  if (!exact) return { kind: "orphan" };
  const prefix = a.prefix ?? "";
  const suffix = a.suffix ?? "";
  const needle = prefix + exact + suffix;

  const first = html.indexOf(needle);
  if (first < 0) return { kind: "orphan" };
  // A second occurrence (even overlapping) makes the target ambiguous: we cannot
  // know which one the reviewer meant, so we refuse to guess and orphan it.
  if (html.indexOf(needle, first + 1) >= 0) return { kind: "orphan" };

  const start = first + prefix.length;
  return { kind: "follow", start, end: start + exact.length };
}
