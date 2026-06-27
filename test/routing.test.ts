import { describe, it, expect } from "vitest";
import { isContentRequest } from "../src/lib/routing";

describe("isContentRequest", () => {
  describe("two-host (App and Content on different hosts)", () => {
    const base = { appHost: "docs.example.com", contentHost: "x.workers.dev" };
    it("routes any path on the content host to Content", () => {
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/p/abc" })).toBe(true);
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/anything" })).toBe(true);
    });
    it("never routes App-host requests to Content", () => {
      expect(isContentRequest({ ...base, host: "docs.example.com", pathname: "/p/abc" })).toBe(false);
      expect(isContentRequest({ ...base, host: "docs.example.com", pathname: "/f/abc" })).toBe(false);
    });
  });

  describe("single-host (App and Content share one host, behind Access)", () => {
    const base = { appHost: "x.workers.dev", contentHost: "x.workers.dev" };
    it("routes only /p/* to Content", () => {
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/p/abc" })).toBe(true);
    });
    it("routes App pages (and everything else) to the App", () => {
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/" })).toBe(false);
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/f/abc" })).toBe(false);
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/api/files" })).toBe(false);
      expect(isContentRequest({ ...base, host: "x.workers.dev", pathname: "/healthz" })).toBe(false);
    });
  });
});
