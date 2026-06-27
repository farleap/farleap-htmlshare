# farleap-htmlshare

社内HTMLプレビュー共有ツール (V1)。AI生成HTMLをアップロードし、社内Googleドメイン認証越しに安全にレンダリング・共有でき、90日で自動削除する。

設計の正本: `farleap-core/docs/superpowers/specs/2026-06-27-html-preview-share-design.md`
実装計画: `farleap-core/docs/superpowers/plans/2026-06-27-html-preview-share.md`

## アーキテクチャ

Cloudflare Workers 上の単一 Hono アプリが、ホスト名で 2 つの面を出し分ける。

| 面 | ホスト (本番) | 認証 | 役割 |
|---|---|---|---|
| **App** | `docs.<domain>` (Cloudflare Access 背後) | Google ドメイン認証 | アップロード / 一覧 / 詳細 / 共有リンク / 削除・pin |
| **Content** | `<project>.workers.dev` (Access の外) | 署名トークン | R2 の生 HTML を厳格ヘッダ付きで配信 |

- **ストレージ**: R2 (HTML blob) + D1 (メタデータ, Drizzle)。
- **自動削除**: Cron Triggers の日次ジョブが 90 日経過・非 pin・未削除を purge。
- **セキュリティの要**: プレビューは「別オリジン + `sandbox="allow-scripts"` (allow-same-origin なし = 不透明オリジン) + 署名トークン + 厳格 CSP」で隔離する。アップロード HTML の JS は動くが、親ページ / Cookie / localStorage には一切到達できない。

## セキュリティ不変条件 (壊してはいけない)

1. iframe は `sandbox="allow-scripts ..."` のみ。**`allow-same-origin` を絶対に付けない**。
2. Content 面は App 面と**別の登録ドメイン**で配信する (V1 は `*.workers.dev`)。
3. Content レスポンスは必ず `Content-Security-Policy` (`frame-ancestors` を App 限定) + `X-Content-Type-Options: nosniff`、**Set-Cookie なし**。
4. アップロードの MIME は**サーバ側で検証** (クライアント申告値を信用しない)。HTML のみ・25MB 上限。
5. ID はすべて不透明 (`crypto.randomUUID()` / ランダムトークン)。

これらは `test/content.test.ts` と `e2e/security.spec.ts` で回帰テスト済み。

## 開発

```bash
bun install
cp .dev.vars.example .dev.vars   # ローカル dev / E2E の設定 (gitignore 済み)
bun run dev                      # wrangler dev (http://127.0.0.1:8787)
```

### dev のオリジン分離

`.dev.vars` は App を `127.0.0.1:8787`、Content を `localhost:8787` に割り当てる。どちらも同じ wrangler dev サーバに着地するが、ブラウザは**別オリジン**として扱うため、本番のクロスオリジン分離を単一サーバで再現できる。dev は HTTP のため `APP_SCHEME=http` を設定する (本番は省略 = `https` 既定)。

## テスト

```bash
bun run test       # vitest (unit + integration, Workers pool). test/**/*.test.ts のみ
bun run test:e2e   # ローカル D1 migration 適用 + Playwright E2E (e2e/**/*.spec.ts)
```

- **unit/integration** (`test/`): 署名トークン / Access JWT / MIME 検証 / アップロード / Content 配信ヘッダ / 共有リンク / 削除・pin / cron purge。
- **E2E** (`e2e/`): アップロード→プレビュー描画、共有リンク遷移、**サンドボックス隔離 (親を読めない)**、Content の未署名 403。

## デプロイ

本番デプロイ・Cloudflare Access・secrets・ドメイン構成は **Cloudflare 認証が必要**。手順は [`docs/deploy.md`](docs/deploy.md) のランブック参照 (`wrangler login` 後に実行)。

### ドメイン方針 (要確定)

- **(a) 専用ドメイン取得 (推奨)**: Cloudflare で安価ドメイン (例 `farleap-docs.com`) を登録。App = `docs.<newdomain>`、Content = `*.workers.dev`。`farleap.co.jp` の DNS を触らないため、Google Workspace 移行期のリスクを避けられる。
- **(b) サブドメイン委任**: `farleap.co.jp` の `docs` サブドメインのみ Cloudflare に委任。Content は引き続き `*.workers.dev`。

> Google Workspace 移行期 (farleap.co.jp の DNS/DMARC が未確定) のため **(a) を推奨**。最終決定は Shuto。

## 実装状況 (V1)

| Task | 内容 | 状態 |
|---|---|---|
| 1-2 | Worker scaffold / D1 schema (将来テーブル含む) | ✅ |
| 3-4 | 署名トークン / Access JWT 検証 + ドメイン allowlist | ✅ |
| 5-6 | アップロード API / Content 配信 (署名 + 厳格ヘッダ) | ✅ |
| 7-8 | ダッシュボード・詳細 (sandbox iframe) / 共有リンク | ✅ |
| 9-10 | 削除・pin / 90 日 cron purge | ✅ |
| 11 | E2E + セキュリティ回帰 (Playwright) | ✅ |
| 12 | 本番デプロイ・Access・ドメイン | ⏳ Cloudflare 認証後に `docs/deploy.md` で実行 |
