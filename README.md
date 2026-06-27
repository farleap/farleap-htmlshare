# farleap-htmlshare

社内HTMLプレビュー共有ツール (V1)。AI生成HTMLをアップロードし、社内Googleドメイン認証越しに安全にレンダリング・共有でき、90日で自動削除する。

設計 spec / 実装計画は社内の設計ドキュメントで管理。

## アーキテクチャ

Cloudflare Workers 上の単一 Hono アプリが、App 面と Content 面を出し分ける。本番は単一 `workers.dev` host に同居させ**パスで分離**（`/p/*` = Content、他 = App）。`isContentRequest()` は二ホスト構成（独自ドメイン採用時 / dev）にも対応。

| 面 | パス | 認証 | 役割 |
|---|---|---|---|
| **App** | `/`, `/f/*`, `/s/*`, `/api/*` | Cloudflare Access (Google, `@farleap.co.jp`/`@dot-conf.jp`) | アップロード / 一覧 / 詳細 / 共有リンク / 削除・pin |
| **Content** | `/p/*` | 署名トークン (+ ログイン済み Cookie で Access 通過) | R2 の生 HTML を厳格ヘッダ付きで配信 |

- **ストレージ**: R2 (HTML blob) + D1 (メタデータ, Drizzle)。
- **自動削除**: Cron Triggers の日次ジョブが 90 日経過・非 pin・未削除を purge。
- **セキュリティの要**: プレビューは「別オリジン + `sandbox="allow-scripts"` (allow-same-origin なし = 不透明オリジン) + 署名トークン + 厳格 CSP」で隔離する。アップロード HTML の JS は動くが、親ページ / Cookie / localStorage には一切到達できない。

## セキュリティ不変条件 (壊してはいけない)

1. iframe は `sandbox="allow-scripts ..."` のみ。**`allow-same-origin` を絶対に付けない**（= 不透明オリジン化が主防御。単一ホストでも親 DOM/Cookie に到達不可）。
2. Content (`/p/*`) は**署名トークン必須**（無し/不正は 403）。本番は単一ホスト + Access。より強い eTLD+1 分離が要れば独自ドメインで二ホスト化できる（`isContentRequest()` 対応済み）。
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

## デプロイ (本番稼働中)

**https://farleap-htmlshare.farleap.workers.dev** で稼働。`workers.dev` 単体 + Cloudflare Access (Google IdP、`@farleap.co.jp` / `@dot-conf.jp` 限定)。独自ドメイン不要。構成と再現手順は [`docs/deploy.md`](docs/deploy.md)。

## 実装状況 (V1)

| Task | 内容 | 状態 |
|---|---|---|
| 1-2 | Worker scaffold / D1 schema (将来テーブル含む) | ✅ |
| 3-4 | 署名トークン / Access JWT 検証 + ドメイン allowlist | ✅ |
| 5-6 | アップロード API / Content 配信 (署名 + 厳格ヘッダ) | ✅ |
| 7-8 | ダッシュボード・詳細 (sandbox iframe) / 共有リンク | ✅ |
| 9-10 | 削除・pin / 90 日 cron purge | ✅ |
| 11 | E2E + セキュリティ回帰 (Playwright) | ✅ |
| 12 | 本番デプロイ + Cloudflare Access (Google ログイン) | ✅ 稼働中 |
