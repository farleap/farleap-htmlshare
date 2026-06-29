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

## 独自ドメイン / サブドメインの方針（2026-06 決定）

**当面 `workers.dev` のまま運用する。独自サブドメイン（例 `docs.farleap.co.jp`）は見送り。**

検討の経緯と理由:

- **目標**: `docs.farleap.co.jp` のような社内ブランドのサブドメインで公開したい。
- **前提（調査結果）**: `farleap.co.jp` は Cloudflare 管理外（NS = お名前.com `*.dnsv.jp`）。さらに **Google Workspace メール(MX = `smtp.google.com`)＋ Vercel の www サイト**が本番稼働中。`dot-conf.jp` も Cloudflare 外（GMO）。Cloudflare Workers のカスタムドメインは、その host が **Cloudflare 上のゾーン**である必要があり、単なる CNAME では Worker に紐づかない。
- **選択肢と判定**:
  - **A. apex (`farleap.co.jp`) を Cloudflare に移管** → `docs.farleap.co.jp` をカスタムドメイン（無料）化できる。**唯一の現実解**だが、会社のメール(MX)・www(Vercel)・SPF/TXT を Cloudflare に正確に移してから NS 切替が必要で、メール断リスクを伴う重い作業。
  - **B. サブドメインだけ Cloudflare に委任（独立ゾーン化）** → **不可**。Cloudflare の *Subdomain setup* は **Enterprise プラン専用**（Free/Pro/Business では提供されない。[公式](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)）。
  - **C. `workers.dev` のまま** → 追加作業ゼロ。Access 付きで社内利用可。
- **決定**: 当面 **C**。B はプラン制約で不可、A は会社ドメイン/メールに関わる不可逆作業のため今は見送り。
- **将来サブドメインが必要になったら**: **A（apex 移管）** を、レコード棚卸し → Cloudflare 自動取込 → MX/TXT/www 目視確認 → 低TTL → NS 切替、の順で慎重に実施する。NS 変更はレジストラ（お名前.com）操作。

### 社内公開の運用（現状）

- 共有 URL: `https://farleap-htmlshare.farleap.workers.dev`
- 社内全員に開くには Zero Trust → Access → Applications → `farleap-htmlshare` → Policies に **Allow / Emails ending in `@farleap.co.jp`（＋ `@dot-conf.jp`）** が入っていることを確認（特定メールのみ許可だと他の人が入れない）。アプリ側 `ALLOWED_DOMAINS` は両ドメイン許可済み。
