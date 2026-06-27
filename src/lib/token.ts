type Payload = { fileId: string; email: string; exp: number };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// The token is carried in a URL query (`?t=`), so both segments must be
// URL-safe. base64url avoids `+` `/` `=`, which would otherwise be mangled
// (e.g. `+` -> space) by query parsing and silently fail verification.
function b64urlEncodeStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

function b64urlDecodeStr(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function signViewToken(secret: string, payload: Payload): Promise<string> {
  const body = b64urlEncodeStr(JSON.stringify(payload));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifyViewToken(
  secret: string, token: string, nowSec: number,
): Promise<{ fileId: string; email: string } | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;
  let p: Payload;
  try {
    const parsed: unknown = JSON.parse(b64urlDecodeStr(body));
    if (typeof parsed !== "object" || parsed === null) return null;
    p = parsed as Payload;
  } catch { return null; }
  if (typeof p.exp !== "number" || p.exp < nowSec) return null;
  if (!p.fileId || !p.email) return null;
  return { fileId: p.fileId, email: p.email };
}
