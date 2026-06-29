# Session Handoff — コメント/レビュー & バージョン管理（Phase 2/3）

> Date: 2026-06-29 · Branch: `docs/design-comments-versioning` · Status: in-progress

## 🎯 Goal
farleap-htmlshare（社内向け「AI生成HTMLを安全に共有・レビュー・反復する」Cloudflare Workers ツール、V1=共有は本番稼働中）に、**コメント/レビュー機能 → バージョン管理**の順で追加する。完成形は Share / Review / Iterate の3体験が噛み合う反復ループ（AI生成→共有→指摘→直して差し替え→指摘が新版へ追従）。

## 📍 Current state
- **Phase 2a（版の土台）完了・コミット済み。** スキーマ追加（`comments.status` / `fileVersions.seq` / index）＋ 既存 files への版1バックフィル（冪等）＋ upload.ts が版行を作成。
- **Phase 2b（コメント/レビュー）機能完成・コミット済み。** API バックエンド・注入ブリッジ・レビュー UI・統合テスト7件。コメントは現行版に対してE2Eで成立。
- **Phase 3（Iterate）バックエンド＋UI 完成・コミット済み（このセッション）。** 新版アップロード `POST /api/files/:id/versions` ＋ 再アンカー（ADR-0005、純粋関数 `src/lib/reanchor.ts`）＋ purge/delete の版・コメント連鎖削除 ＋ 版一覧 `GET /api/files/:id/versions` ＋ 詳細画面 UI（差し替え/版セレクタ/過去版バナー）＋ 過去版配信 `?v=<seq>`。
- **push 済み・PR 作成済み:** **PR #1** → https://github.com/farleap/farleap-htmlshare/pull/1 （base `main`）。
- **ライブ検証 完了（このセッション）。** `wrangler dev`（App=127.0.0.1:8787 / Content=localhost:8787、別オリジン）＋ curl + Playwright で実ブラウザ通し確認: レビュー handshake（MessagePort・opaque iframe）→選択ヒント→UI投稿→パネル描画、差し替えボタン→note prompt→新版→リロード→版ストリップ・コメント追従(active@v2)、過去版 `?v=1` バナー＋v1配信。再アンカー（追従/orphaned）・`?v` 404 も実ランタイムで一致。
- typecheck rc=0、**14 test files / 67 tests pass**。作業ツリーはクリーン（`.serena/` のみ untracked、無視）。

## ✅ Done this session
- 設計ドキュメントを新設: `docs/DESIGN.md`（完成形の正典）＋ `docs/adr/0001-0006`（決定記録）。ルートREADMEからリンク。
- 独立レビュー（サブエージェント3観点）で設計を固め、Critical/High を反映（最重要は ADR-0006）。誤指摘1件は検証して棄却。
- Phase 2a: schema + migration 0001/0002（バックフィル冪等、ローカルD1で検証）+ upload.ts。
- Phase 2b #1: コメントAPI（`src/routes/comments.ts`、index.ts にマウント）。
- Phase 2b #2: 注入ブリッジ（`src/routes/content.ts` の `REVIEW_BOOTSTRAP`、`?review=1` 時のみ）。
- Phase 2b #3: レビューUI＋パネル（`src/routes/pages.tsx` の `REVIEW_SCRIPT`、App面 textContent エスケープ）。
- コメントAPI統合テスト（`test/comments.test.ts`、7件）。

## ▶️ Next action (start here)
**PR #1 のレビュー反映 → main マージ → 本番デプロイ（`bun run deploy`＝`wrangler deploy`）。**
実装・テスト・ライブ検証はすべて完了。残るは取り込みと配備、そして将来機能:
- PR #1（https://github.com/farleap/farleap-htmlshare/pull/1）をレビュー→ main マージ。
- 本番 D1 へマイグレーション適用（`wrangler d1 migrations apply farleap-htmlshare --remote`）してから `wrangler deploy`。0001/0002 は本番未適用の可能性が高い→デプロイ前に必ず適用。
- その後の将来作業は下記 TODO（差分表示・Phase 4）。
- 補足: この環境でも `wrangler dev` + Playwright は**今回は安定動作した**（過去の不安定注意は緩和）。dev サーバは停止済み。

## 📋 TODO (prioritized)
- [x] (P1) Phase 3 #1: 新版アップロード `POST /api/files/:id/versions`。owner-only、seq=max+1、id `${id}-v${seq}`、files 更新、title/share/pin 継承。→ `4230f2d`
- [x] (P1) Phase 3 / 2b#4: 再アンカー（`src/lib/reanchor.ts` 純粋関数＋versions.ts 統括）。一意完全一致で追従・外れたら orphaned。→ `4230f2d`
- [x] (P2) purge/delete 連鎖削除（全版blob＋comments＋fileVersions＋shareLinks）。retention 最終版起点。→ `54fea28`
- [x] (P2) 版一覧 `GET /api/files/:id/versions`（viewer-level、R2キー非露出）。→ `171eea7`
- [x] (P2) Phase 3 UI: 差し替えボタン＋版セレクタ＋過去版バナー。→ `e0737fc`
- [x] (P2 設計判断→決定) 過去版プレビュー配信 = **`?v=<seq>` セレクタ方式**。view token は fileId 認可のまま不変、seq はサーバ側で fileVersions→r2Key に解決（クライアントパス不信）。版はファイル権限継承で信頼境界不変。→ `e0737fc`
- [x] (P3) push + PR。→ **PR #1**。
- [x] (P1) ライブ検証（curl + Playwright で実ブラウザ通し確認、全項目一致）。
- [ ] (P1) PR #1 レビュー反映 → main マージ → 本番マイグレーション適用 → `wrangler deploy`（↑Next action）。
- [ ] (P3) 差分(diff)表示、Phase 4（permissions / 社外共有 / 通知）。

## 🧠 Key context & decisions
- **⚠️ この環境は不安定。** (1) `Write`/`Edit` ツールが「成功」と返すのにディスクに反映されないことがある。(2) Bash の stdout が文字化け・二重化する。(3) untracked ファイルが消える（root の `handoff.md` と最初の DESIGN.md/ADR が消失した）。(4) `kill` 不達。**対策: コード変更は Bash heredoc (`cat > file <<'EOF'`) で書く。コマンド結果はファイルにリダイレクトして Read ツールで読む。小ステップごとに即コミット（コミット済みは生き残る）。**
- **ファイルの ground truth は `git show HEAD:<path>`。** セッション序盤の通常 Read が文字化けして、実在しない関数名で upload.ts を誤って復元した（`validateHtmlUpload` は無く、実体は `extractTitle`/`looksLikeHtml`）。コード変更前は必ず git の本物を確認すること。
- **設計の正典は `docs/DESIGN.md`、決定は `docs/adr/0001-0006`。** 最重要は **ADR-0006（iframe メッセージの信頼境界）**: プレビュー iframe 内では注入スクリプトと敵対HTMLのJSが**同一コンテキスト同居**するため、iframe→親の postMessage は **origin 検証で信頼できない＝すべて未信頼入力**。特権操作（コメント保存/解決/削除）は **App 認証API のみ**で行い、選択ヒントは composer プリフィルだけ。アンカーは App 側で再検証。コメント由来文字列は App 面で **textContent のみ**（innerHTML 禁止、stored XSS 回避）。sandbox は `allow-same-origin` を絶対付けない（不透明オリジン＝主防御、レビューモードでも不変）。
- **版ID規約: `${fileId}-v1`（決定論的）。** バックフィル(0002)も upload.ts もこの規約。新版は `seq` をインクリメント。
- **スキーマの事実:** `comments` には anchor列（versionId/anchorExact/Prefix/Suffix/Start/End）・resolved・parentId が**既存**。Phase 2a で足したのは `status`(active|orphaned|resolved) / `fileVersions.seq` / index のみ。
- **テスト作法:** `ACCESS_AUD=test-bypass` で authGuard バイパス。リクエストに `host: "docs.local"` と `X-Test-Email: <email>` を付ける。`app.fetch(req, env, ctx)`。seed は files 行 + R2 `files/<id>/v1.html`。`test/comments.test.ts` 参照。
- **Codex CLI はこの環境で動かない**（`--search` がネット制限でハング、kill不達）。代わりにサブエージェント独立レビューを使った。codex MCP を user スコープ登録試行したが要セッション再起動・未検証（[[codex-cli-local-unstable]] memory 参照）。
- **#4 再アンカーを Phase 3 に回した理由:** 新版アップロードが存在しないと再アンカーは発火しない。新版フローと一体で実装するのが ADR-0005 の正しい順序。
- プロジェクトメモリ: `~/.claude/projects/-Users-shu-t0-Documents-dev-shu-t0-farleap-farleap-htmlshare/memory/`（status / design-docs / codex-unstable / doc-style）。

## 🚧 Blockers / open questions
- ブランチ `docs/design-comments-versioning` は**未push（upstream 無し）**。push して PR にするか、ローカルのままか未判断。
- レビューフローのライブ動作が**未検証**（環境が不安定で E2E/手動が困難）。安定環境での確認が必要。
- `src/cron.ts` の purge が新スキーマ（版・コメント）を連鎖削除するか未確認。Phase 3 で要点検。

## 📂 References
- Files:
  - `docs/DESIGN.md` — 完成形の設計正典（§6.2 コメント, §6.3 バージョン, §8 ロードマップ）
  - `docs/adr/0001-0006/*.md` — 決定記録（0006 が iframe 信頼境界）
  - `src/routes/comments.ts` — コメント API（list/create/patch/delete、ADR-0006 認可）
  - `src/routes/content.ts` — `REVIEW_BOOTSTRAP` と `injectReview()`（`?review=1` 注入）
  - `src/routes/pages.tsx` — `REVIEW_SCRIPT`（レビューUI・MessagePort handshake・textContent描画）
  - `src/routes/upload.ts` — アップロード時の版行作成（版ID `${id}-v1`）
  - `src/db/schema.ts` — comments/fileVersions/files
  - `migrations/0001_*.sql`（ALTER）, `migrations/0002_backfill_*.sql`（手書き冪等バックフィル）
  - `test/comments.test.ts` — API 統合テスト7件（作法のリファレンス）
  - `src/routes/manage.ts` — `owned()` 認可パターン＋論理削除（全版 blob 連鎖削除済み）
  - `src/routes/versions.ts` — 新版アップロード（owner-only）＋版一覧（viewer-level）
  - `src/lib/reanchor.ts` — 再アンカーの純粋関数（一意 prefix+exact+suffix 完全一致のみ follow）
  - `src/cron.ts` — purge の file 単位連鎖削除（全版blob＋comments＋fileVersions＋shareLinks）
  - `test/versions.test.ts`（12）/ `test/reanchor.test.ts`（6）— 新規テスト
- Commits（`a47b23f` の上、新しい順）:
  - **このセッション（Phase 3 backend）:** `171eea7` 版一覧API / `54fea28` purge/delete 連鎖削除 / `4230f2d` 新版アップロード＋再アンカー
  - 前セッション: `cd630c5` test(comments) / `bbeeaa3` レビューUI / `7cff1ef` 注入ブリッジ / `1807e11` DESIGN.md / `a4ba7c8` コメントAPI / `96cf84c` ADR-0006 / `539dd6f` 設計docs / `fe6e7f0` Phase 2a
- Env / state:
  - ブランチ `docs/design-comments-versioning`、**未push**（main の上に10コミット）。作業ツリー clean（`.serena/` のみ untracked）。
  - 検証コマンド: `bun run typecheck`（rc判定）, `bun run test`（vitest Workers pool, 40 tests）。
  - ローカルD1適用: `bunx wrangler d1 migrations apply farleap-htmlshare --local`。
