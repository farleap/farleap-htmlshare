# 本番デプロイ ランブック (Task 12)

> このリポジトリの V1 コードは完成済み (Task 1-11)。本書は **Cloudflare 認証後にオペレーターが一度だけ実行**する本番化手順。各ステップは Cloudflare アカウントの権限を要する。

前提:
- Cloudflare アカウント (Workers Paid 不要・無料枠で完結)。
- `wrangler login` 済み (`bunx wrangler whoami` で確認)。
- ドメイン方針 (a)/(b) を確定済み (README「ドメイン方針」参照、推奨 = (a))。

---

## Step 1: ドメイン方針を確定し、ゾーンを Cloudflare に載せる

### (a) 専用ドメイン (推奨)
1. Cloudflare Dashboard → Domain Registration で安価ドメインを登録 (例 `farleap-docs.com`)。
2. App ホスト = `docs.farleap-docs.com`、Content ホスト = `farleap-htmlshare.<account>.workers.dev`。
   - App と Content の **eTLD+1 が異なる**ため Cookie は完全分離 (セキュリティ不変条件 2 を満たす)。

### (b) サブドメイン委任
1. `farleap.co.jp` の `docs` サブドメインのみ Cloudflare に委任 (権威 NS をサブドメイン単位で委任、または該当レコードを Cloudflare 管理ゾーンへ)。
2. **Google Workspace 移行期は MX/SPF/DKIM/DMARC に影響しない形で**行うこと。apex や mail 系レコードには触れない。

決定したら `wrangler.jsonc` を本番設定に更新する (Step 2)。

---

## Step 2: 本番リソースを作成

```bash
# R2 バケット
bunx wrangler r2 bucket create farleap-htmlshare

# D1 データベース
bunx wrangler d1 create farleap-htmlshare
#  → 出力された database_id を wrangler.jsonc の d1_databases[0].database_id に設定
#    (現在は "local-placeholder")
```

`wrangler.jsonc` に本番ホスト設定を追加する。`vars` の `APP_HOST` / `CONTENT_HOST` を本番値にし、App ホストの custom domain route を追加 (Content は `*.workers.dev` のまま = Access の外):

```jsonc
// 本番値の例 (ドメイン (a) を選んだ場合)
"vars": {
  "APP_HOST": "docs.farleap-docs.com",
  "CONTENT_HOST": "farleap-htmlshare.<account>.workers.dev",
  "ALLOWED_DOMAINS": "farleap.co.jp,dot-conf.jp"
  // APP_SCHEME は省略 = https 既定 (本番)
},
"routes": [
  { "pattern": "docs.farleap-docs.com", "custom_domain": true }
]
```

> `ACCESS_TEAM_DOMAIN` は `vars` に `<team>.cloudflareaccess.com` を設定 (Step 4 で確定)。`TOKEN_SECRET` と `ACCESS_AUD` は **secret** で投入 (Step 3)。

---

## Step 3: secrets 投入

```bash
# 署名トークン鍵 (ランダム 32 バイト)。例: openssl rand -base64 32
bunx wrangler secret put TOKEN_SECRET

# Access Application の Audience (AUD) タグ (Step 4 で取得)
bunx wrangler secret put ACCESS_AUD
```

> `ACCESS_AUD` を本番 secret に入れることで、dev の `authGuard()` test-bypass (`ACCESS_AUD === "test-bypass"` のときだけ `X-Test-Email` を信用) は本番で**完全に無効**になる。

---

## Step 4: Cloudflare Access (Zero Trust) を構成

1. Zero Trust → Settings → Authentication → Login methods に **Google** を IdP として追加 (Google Workspace)。
2. Access → Applications → Add an application → **Self-hosted**。
   - Application domain = `docs.farleap-docs.com` (App ホスト)。
   - **Content ホスト (`*.workers.dev`) には Access を付けない** (署名トークンで保護するため)。
3. Policy: Action = Allow, Include = **Emails ending in** `@farleap.co.jp` **OR** `@dot-conf.jp` (移行期は両方)。
4. Application 設定の **Application Audience (AUD) タグ**を控え、Step 3 の `ACCESS_AUD` secret に投入。
5. `<team>.cloudflareaccess.com` を `wrangler.jsonc` の `ACCESS_TEAM_DOMAIN` (vars) に設定。

> Access ≤50 名は無料。JWT は `Cf-Access-Jwt-Assertion` ヘッダで App に渡り、`src/lib/access.ts` が JWKS で署名検証 + ドメイン allowlist を判定する。

---

## Step 5: マイグレーション適用 + デプロイ

```bash
bunx wrangler d1 migrations apply farleap-htmlshare --remote
bunx wrangler deploy
```

cron (日次 `0 3 * * *`) は `wrangler deploy` で自動登録される (`wrangler.jsonc` の `triggers.crons`)。

---

## Step 6: 本番でセキュリティ回帰を再実行 (必須)

dev は単一サーバでオリジンを模した。**本番の真のクロスオリジン配信で再検証する**:

```bash
BASE_URL=https://docs.farleap-docs.com bunx playwright test e2e/security.spec.ts
```

確認項目:
- サンドボックス iframe が親 (`window.parent.document`) を読めず BLOCKED になること。
- Content (`*.workers.dev`) への**未署名アクセスが 403** であること。

> `BASE_URL` 指定時、`playwright.config.ts` はローカル webServer を起動しない。Access 背後の App にアクセスするため、CI/手元で Access のサービストークン or 認証済みセッションが必要 (security spec の API 経路は `X-Test-Email` を使うが、本番は test-bypass が無効なので Access 認証が要る点に注意。本番回帰は手動ブラウザ + 認証済みセッションでの確認を推奨)。

---

## Step 7: 運用メモ

- **コスト**: Workers 10万req/日・R2 10GB+egress無料・D1 5GB・Access ≤50名・Cron 無料 → 実質 $0。任意コストは (a) の独自ドメイン (~$10/年) のみ。
- **90 日削除**: cron が `expires_at < now AND pinned=0 AND deleted_at IS NULL` を R2+D1+share_links ごと purge。pin したファイルは `expires_at=NULL` で永続。
- **将来フェーズ**: `file_versions` / `comments` / `permissions` テーブルは定義済み・V1 未使用 (Phase 2/3 で有効化)。

## デプロイ前チェックリスト

- [ ] `bun run test` 緑 (vitest)
- [ ] `bun run test:e2e` 緑 (Playwright, ローカル)
- [ ] ドメイン方針 (a)/(b) 確定
- [ ] `wrangler.jsonc`: `database_id` を実値に / `APP_HOST`・`CONTENT_HOST`・route を本番値に
- [ ] secrets: `TOKEN_SECRET` / `ACCESS_AUD` 投入済み
- [ ] Access: Google IdP + ドメイン allowlist policy 設定済み
- [ ] `wrangler d1 migrations apply --remote` 実行済み
- [ ] `wrangler deploy` 成功
- [ ] 本番 security 回帰 (Step 6) 確認済み
