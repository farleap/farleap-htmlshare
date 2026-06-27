import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { verifyAccessJwt } from "../src/lib/access";

const ISS = "https://team.cloudflareaccess.com";
const AUD = "test-aud";
let jwks: any;
let signKey: any;

async function mint(email: string, audience = AUD, issuer = ISS) {
  return await new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(issuer).setAudience(audience)
    .setExpirationTime("5m").sign(signKey);
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  signKey = privateKey;
  const pub = await exportJWK(publicKey);
  pub.kid = "k1"; pub.alg = "RS256";
  jwks = createLocalJWKSet({ keys: [pub] });
});

describe("verifyAccessJwt", () => {
  const opts = () => ({ jwks, aud: AUD, issuer: ISS, allowedDomains: ["farleap.co.jp", "dot-conf.jp"] });

  it("accepts a valid farleap email", async () => {
    expect(await verifyAccessJwt(await mint("a@farleap.co.jp"), opts())).toEqual({ email: "a@farleap.co.jp" });
  });
  it("accepts dot-conf email", async () => {
    expect(await verifyAccessJwt(await mint("b@dot-conf.jp"), opts())).toEqual({ email: "b@dot-conf.jp" });
  });
  it("rejects an outside domain", async () => {
    expect(await verifyAccessJwt(await mint("x@gmail.com"), opts())).toBeNull();
  });
  it("rejects wrong audience", async () => {
    expect(await verifyAccessJwt(await mint("a@farleap.co.jp", "wrong"), opts())).toBeNull();
  });
});
