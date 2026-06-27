export function extractTitle(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : fallback;
}

export function looksLikeHtml(bytes: Uint8Array): boolean {
  // Reject if NUL/control bytes appear in the first 512 bytes (binary), require an HTML-ish token.
  const slice = bytes.subarray(0, 512);
  for (const b of slice) {
    if (b === 0 || (b < 9) || (b > 13 && b < 32)) return false;
  }
  const head = new TextDecoder().decode(slice).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html") || head.includes("<body") || head.includes("<head") || /<[a-z]/.test(head);
}
