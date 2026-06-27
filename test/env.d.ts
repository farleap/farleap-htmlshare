import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// The vitest-pool-workers `cloudflare:test` module types `env` as Cloudflare.Env.
// Augment that global with the bindings the tests rely on (set in vitest.config.ts
// miniflare.bindings). Keep in sync with that config and src/index.ts's Env.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      BUCKET: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
      TOKEN_SECRET: string;
      ACCESS_TEAM_DOMAIN: string;
      ACCESS_AUD: string;
      APP_HOST: string;
      CONTENT_HOST: string;
      APP_SCHEME: string;
      ALLOWED_DOMAINS: string;
    }
  }
}
