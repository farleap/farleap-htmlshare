# デプロイ構成 (本番稼働中)

本番は **Cloudflare Workers の `workers.dev` URL 単体 + Cloudflare Access (Google IdP)** で稼働している。独自ドメインや DNS 変更は不要。

- **URL**: `https://farleap-htmlshare.farleap.workers.dev`
- **認証**: Cloudflare Access が host 全体を Google ログインで保護（`@farleap.co.jp` / `@dot-conf.jp` のみ許可）
- **配信**: 同一 host の `/p/*` がプレビュー配信（Content）。ログイン後の iframe は同一 host の Access Cookie を自動付与して通過し、加えて署名トークンで保護される
- **ストレージ**: D1 `farleap-htmlshare` + R2 `farleap-htmlshare`、cron `0 3 * * *`（90日 purge）

## 単一ホスト構成の要点

App 面と Content 面を1つの `workers.dev` host に同居させ、`src/lib/routing.ts` の `isContentRequest()` がパスで出し分ける（`APP_HOST === CONTENT_HOST` のとき `/p/*` だけ Content、他は App）。Access は host 全体に掛け、ログイン済みユーザーの同一ホスト iframe は Cookie で `/p/*` を通過できる。

> ローカル dev は二ホスト相当（App=`127.0.0.1:8787` / Content=`localhost:8787`、`.dev.vars`）でクロスオリジンを模す。`isContentRequest()` は両モードを処理する。

## 設定値 (wrangler.jsonc / secrets)

| キー | 種別 | 値 |
|---|---|---|
| `APP_HOST` | var | `farleap-htmlshare.farleap.workers.dev` |
| `CONTENT_HOST` | var | `farleap-htmlshare.farleap.workers.dev`（= APP_HOST = 単一ホスト） |
| `ACCESS_TEAM_DOMAIN` | var | `farleap.cloudflareaccess.com` |
| `ALLOWED_DOMAINS` | var | `farleap.co.jp,dot-conf.jp` |
| `TOKEN_SECRET` | **secret** | 署名トークン鍵（`openssl rand -base64 32`） |
| `ACCESS_AUD` | **secret** | Access アプリの Application Audience タグ |

`APP_SCHEME` は本番では未設定（既定 `https`）。dev のみ `.dev.vars` で `http`。

## ゼロから再現する手順

```bash
bunx wrangler login
bunx wrangler d1 create farleap-htmlshare        # 出力の database_id を wrangler.jsonc に
bunx wrangler r2 bucket create farleap-htmlshare  # 事前にダッシュボードで R2 を有効化
# workers.dev サブドメインをダッシュボードで登録 (Workers & Pages → Subdomain)
bunx wrangler d1 migrations apply farleap-htmlshare --remote
openssl rand -base64 32 | bunx wrangler secret put TOKEN_SECRET
bunx wrangler deploy
```

### Cloudflare Access (Google ログイン) の設定 — ダッシュボード

1. **Zero Trust** を開きチーム名を決める → チームドメイン `<team>.cloudflareaccess.com`。
2. **Google IdP**: Google Cloud Console で OAuth クライアント(Web)を作成。
   - Authorized JavaScript origins: `https://<team>.cloudflareaccess.com`
   - Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Zero Trust → Settings → Authentication → Login methods → Google に Client ID/Secret を登録。
3. **Worker に Access を掛ける**: Workers & Pages → 当 Worker → ドメイン → production URL のアクセスを「公開」→「制限」に変更。表示される **AUD** を `ACCESS_AUD` secret に、**JWK URL** のホストを `ACCESS_TEAM_DOMAIN` に設定。
4. **ポリシー**: Zero Trust → Access → アプリケーション → 当アプリのポリシーを **Allow / Emails ending in `@farleap.co.jp` ＋ `@dot-conf.jp`**。
5. **ログイン方法**: 当アプリの認証で「すべての IdP を受け入れる」を ON（または Google を選択）。
6. 設定後 `bunx wrangler deploy` で `ACCESS_TEAM_DOMAIN` を反映。

`ACCESS_AUD` が本番の実 AUD になることで、dev の `authGuard` test-bypass (`ACCESS_AUD === "test-bypass"`) は本番で無効化される。

## デプロイ前チェックリスト

- [ ] `bun run typecheck` 0 / `bun run test` 緑 / `bun run test:e2e` 緑（ローカル）
- [ ] `wrangler.jsonc`: `database_id` 実値 / hosts / `ACCESS_TEAM_DOMAIN`
- [ ] secrets: `TOKEN_SECRET` / `ACCESS_AUD`
- [ ] Access: Google IdP + ポリシー(2ドメイン) + host 全体に適用
- [ ] `wrangler d1 migrations apply --remote` / `wrangler deploy`
- [ ] 実ログイン → ダッシュボード → アップロード → プレビュー描画を確認
