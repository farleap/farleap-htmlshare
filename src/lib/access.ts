import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import type { MiddlewareHandler } from "hono";

export async function verifyAccessJwt(
  token: string,
  opts: { jwks: JWTVerifyGetKey; aud: string; issuer: string; allowedDomains: string[] },
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, opts.jwks, {
      audience: opts.aud, issuer: opts.issuer,
    });
    const email = String(payload.email ?? "").toLowerCase();
    const domain = email.split("@")[1];
    if (!domain || !opts.allowedDomains.includes(domain)) return null;
    return { email };
  } catch {
    return null;
  }
}

declare module "hono" {
  interface ContextVariableMap { userEmail: string; }
}

export function accessAuth(): MiddlewareHandler {
  return async (c, next) => {
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (!token) return c.json({ error: "unauthorized" }, 401);
    const issuer = `https://${c.env.ACCESS_TEAM_DOMAIN}`;
    const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const allowed = String(c.env.ALLOWED_DOMAINS).split(",").map((d) => d.trim());
    const r = await verifyAccessJwt(token, { jwks, aud: c.env.ACCESS_AUD, issuer, allowedDomains: allowed });
    if (!r) return c.json({ error: "forbidden" }, 403);
    c.set("userEmail", r.email);
    await next();
  };
}
