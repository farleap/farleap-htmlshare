import type { MiddlewareHandler } from "hono";
import { accessAuth } from "./access";

export function authGuard(): MiddlewareHandler {
  return async (c, next) => {
    const testEmail = c.req.header("X-Test-Email");
    if (testEmail && c.env.ACCESS_AUD === "test-bypass") {
      c.set("userEmail", testEmail);
      return next();
    }
    return accessAuth()(c, next);
  };
}
