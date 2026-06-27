import type { D1Migration } from "@cloudflare/vitest-pool-workers";
declare module "cloudflare:test" {
  interface ProvidedEnv {
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
