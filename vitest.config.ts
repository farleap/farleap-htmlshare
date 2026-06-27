// vitest.config.ts
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    // Only unit/integration tests run in the Workers pool. Playwright specs under
    // e2e/ run via `playwright test`, not vitest (they import @playwright/test,
    // which the Workers runtime can't load).
    include: ["test/**/*.test.ts"],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["DB"],
        r2Buckets: ["BUCKET"],
        bindings: {
          TEST_MIGRATIONS: migrations,
          TOKEN_SECRET: "test-secret",
          ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
          ACCESS_AUD: "test-bypass",
          APP_HOST: "docs.local",
          CONTENT_HOST: "content.local",
          // Pinned here so tests are deterministic and independent of .dev.vars
          // (which the pool would otherwise merge in, e.g. APP_SCHEME=http).
          APP_SCHEME: "https",
          ALLOWED_DOMAINS: "farleap.co.jp,dot-conf.jp",
        },
      },
    }),
  ],
});
