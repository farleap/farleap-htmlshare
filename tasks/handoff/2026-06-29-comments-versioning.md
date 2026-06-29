# Session Handoff — コメント/レビュー & バージョン管理（Phase 2/3）

> Date: 2026-06-29 · Branch: `docs/design-comments-versioning` · Status: in-progress

## 🎯 Goal
farleap-htmlshare（社内向け「AI生成HTMLを安全に共有・レビュー・反復する」Cloudflare Workers ツール、V1=共有は本番稼働中）に、**コメント/レビュー機能 → バージョン管理**の順で追加する。完成形は Share / Review / Iterate の3体験が噛み合う反復ループ（AI生成→共有→指摘→直して差し替え→指摘が新版へ追従）。

## 📍 Current state
- **Phase 2a（版の土台）完了・コミット済み。** スキーマ追加（`comments.status` / `fileVersions.seq` / index）＋ 既存 files への版1バックフィル（冪等）＋ upload.ts が版行を作成。
- **Phase 2b（コメント/レビュー）機能完成・コミット済み。** API バックエンド・注入ブリッジ・レビュー UI・統合テスト7件。コメントは現行版に対してE2Eで成立。
- **未検証ギャップ:** ブラウザでの実操作フロー（選択→postMessage→パネル→投稿）はライブ実行していない（typecheck と API 統合テストは通る）。
- **ブランチは未push（upstream 無し）。** main(`a47b23f`)の上に7コミット。push/PR は未判断。
- typecheck rc=0、12 test files / 40 tests pass。作業ツリーはクリーン（`.serena/` のみ untracked、無視）。

## ✅ Done this session
- 設計ドキュメントを新設: `docs/DESIGN.md`（完成形の正典）＋ `docs/adr/0001-0006`（決定記録）。ルートREADMEからリンク。
- 独立レビュー（サブエージェント3観点）で設計を固め、Critical/High を反映（最重要は ADR-0006）。誤指摘1件は検証して棄却。
- Phase 2a: schema + migration 0001/0002（バックフィル冪等、ローカルD1で検証）+ upload.ts。
- Phase 2b #1: コメントAPI（`src/routes/comments.ts`、index.ts にマウント）。
- Phase 2b #2: 注入ブリッジ（`src/routes/content.ts` の `REVIEW_BOOTSTRAP`、`?review=1` 時のみ）。
- Phase 2b #3: レビューUI＋パネル（`src/routes/pages.tsx` の `REVIEW_SCRIPT`、App面 textContent エスケープ）。
- コメントAPI統合テスト（`test/comments.test.ts`、7件）。

## ▶️ Next action (start here)
**Phase 3 #1: 新版アップロードのエンドポイントを実装する。**
`src/routes/` に `POST /api/files/:id/versions`（または既存ルートに追加）を作る:
- 認可は manage.ts の `owned()` パターン（所有者のみ、App認証＋DB検証）。
- 新版 = 同一 `files` 行に `fileVersions` を1行追加（`seq = 現在最大+1`、`r2Key = files/<id>/v<seq>.html`）、R2 に新 blob を put、`files.currentVersionId` と `updatedAt` を更新。
- タイトル/期限/共有リンク/pin は file 単位で継承（版ごとに作り直さない）。
- これが入ると **#4 再アンカー**（ADR-0005）のトリガーが揃う → 同じフローで未解決コメントを引用テキストで新版に再マッチ（一意一致なら追従、曖昧/不一致なら `status='orphaned'`）。
まず upload.ts の本物を `git show HEAD:src/routes/upload.ts` で確認してからパターンを踏襲すること。

## 📋 TODO (prioritized)
- [ ] (P1) Phase 3 #1: 新版アップロード `POST /api/files/:id/versions`（↑Next action）。
- [ ] (P1) Phase 3 / 2b#4: 再アンカー実装。新版適用時に未解決コメントを `anchorPrefix+anchorExact+anchorSuffix` の一意完全一致で再マッチ→追従、外れたら `orphaned`。規則は ADR-0005「再アンカーの具体規則」。
- [ ] (P1) ライブ検証: レビューフロー（`?review=1` の注入→MessagePort handshake→選択ヒント→投稿）を E2E か手動で確認。**安定環境で**（この環境は wrangler/Playwright 不安定）。
- [ ] (P2) 版セレクタ UI（詳細画面で過去版を閲覧、作成者/日時/メモ表示）。
- [ ] (P2) cron purge を版・コメント連鎖削除に対応（file単位で全版blob＋comments削除、保持期限は最終版起点）。現状 `src/cron.ts` は files のみ想定の可能性。要確認。
- [ ] (P3) `docs/DESIGN.md` の §6.3 体験どおりの「新版アップロード」UI 導線（差し替えボタン）。
- [ ] (P3) 差分(diff)表示、Phase 4（permissions / 社外共有 / 通知）。
- [ ] (P3) ブランチを push して PR にするか判断。

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
  - `src/routes/manage.ts` — `owned()` 認可パターン（新版エンドポイントで踏襲）
- Commits（このセッション、`a47b23f` の上）:
  - `cd630c5` test(comments) 統合テスト / `bbeeaa3` レビューUI / `7cff1ef` 注入ブリッジ
  - `1807e11` DESIGN.md 再同期 / `a4ba7c8` コメントAPI / `96cf84c` ADR-0006 / `539dd6f` 設計docs / `fe6e7f0` Phase 2a
- Env / state:
  - ブランチ `docs/design-comments-versioning`、**未push**。作業ツリー clean（`.serena/` のみ untracked）。
  - 検証コマンド: `bun run typecheck`（rc判定）, `bun run test`（vitest Workers pool, 40 tests）。
  - ローカルD1適用: `bunx wrangler d1 migrations apply farleap-htmlshare --local`。
