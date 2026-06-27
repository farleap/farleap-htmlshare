import type { MiddlewareHandler } from "hono";
import { accessAuth } from "./access";

// Default identity for local browsing when no header is supplied (dev only).
const DEV_USER = "dev@farleap.co.jp";

export function authGuard(): MiddlewareHandler {
  return async (c, next) => {
    // Dev/test only: ACCESS_AUD === "test-bypass" is set in .dev.vars and the
    // vitest pool, never in production (where it's a real Access secret). In that
    // mode, honor an explicit X-Test-Email (used by E2E) and otherwise log in as a
    // default dev user, so the local server is browsable without custom headers.
    if (c.env.ACCESS_AUD === "test-bypass") {
      c.set("userEmail", c.req.header("X-Test-Email") ?? DEV_USER);
      return next();
    }
    return accessAuth()(c, next);
  };
}
