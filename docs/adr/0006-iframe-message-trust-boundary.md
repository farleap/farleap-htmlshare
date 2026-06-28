# ADR-0006: iframe メッセージの信頼境界（コメント注入の安全設計）

- Status: Accepted
- Date: 2026-06-28

## Context

インラインコメント（[ADR-0004](./0004-inline-anchored-comments.md)）は、Content 面が配信する HTML に
「テキスト選択検知・ハイライト描画・親へ postMessage」する表示用スクリプトを注入して実現する。
ここに、独立レビューで指摘された根本的な落とし穴がある。

プレビュー iframe は不透明オリジン（[ADR-0001](./0001-opaque-origin-iframe-isolation.md)）で親から守られているが、
iframe の**内部**では、注入スクリプトと**アップロードされた信頼できない HTML の JS が、同じ window・同じ DOM・
同じ postMessage 送信権限を共有**する。つまり:

- 敵対 HTML は注入スクリプトのふりをして親へ**偽の postMessage** を自由に送れる。
- 注入スクリプトの関数・prototype を上書きして選択内容を改ざんできる。
- 不透明オリジンでは `event.origin` が `null`／都度変化し、**origin 値による送信者識別が成立しない**。
  同一 iframe 内の敵対 JS も同じ origin を名乗るため、origin 検証では両者を区別できない。

当初の設計は「postMessage の origin を厳密検証すれば安全」と読めたが、これは**誤った前提**だった。

## Considered Options

1. **origin 検証だけに頼る**（当初案）。
2. **CSP で敵対 JS と注入スクリプトを分離**する。
3. **iframe からのメッセージを常に「未信頼ユーザー入力」として扱う**（信頼境界を引き直す）。

## Decision

**選択肢 3 を採用。** iframe から親へ来る postMessage は、注入スクリプト由来か敵対 JS 由来かを
区別できない前提で、すべて「未信頼入力」として扱う。不変条件:

1. **iframe メッセージ単独で副作用を起こさない。** コメントの保存・編集・解決・削除といった特権操作は、
   iframe メッセージをトリガにせず、必ず App 側の認証済みユーザー操作＋認証付き API を経る。
   iframe から来るのは「ユーザーがこの範囲を選んだ」というヒントだけ。
2. **アンカー・選択テキストは App 側で再検証する。**
3. **通信は MessagePort + nonce で確立する。** origin 値に依存しない。ポートも奪われ得るため、
   ポート越しのメッセージも未信頼入力として扱い二重化する。
4. **注入スクリプトは敵対 JS に先行実行し、自身の API を保全する**（即時クロージャ退避・`Object.freeze`）。
   同一コンテキスト同居の根本制約は消えないので過信せず 1〜3 を主防御とする。
5. **CSP に「敵対 JS と注入 JS の分離」を期待しない。** 同一 DOM 内では nonce も読まれ得る。
   CSP は frame-ancestors と exfiltration 抑制（connect-src 等）に用いる。
6. **コメント由来文字列は App 面で常にエスケープする。** コメント本文・引用テキストは敵対 HTML 由来を
   含みうる。App（信頼オリジン）に描画する際は必ずテキストとして扱い、HTML として解釈しない
   （`raw` / `dangerouslySetInnerHTML` 禁止）。さもなくば隔離を迂回した stored XSS になる。
7. **レビューモードでも sandbox 属性は不変。** `allow-same-origin` を足す等の緩和を禁じる。
   選択取得は「注入スクリプト → postMessage」経由のみを唯一の手段とする。

## Consequences

- **Positive:** 「iframe の中で敵対 JS と同居する」事実を正面から受け止めた設計になり、注入方式でも
  主防御（不透明オリジン）が骨抜きにならない。特権操作が App 認証 API に集約され認可を一箇所で守れる。
- **Negative:** 「選択したら即保存」のような片道操作に App 側の明示操作が要る。注入スクリプトの初期化が複雑化。
- **不変条件化:** 上記 1〜7 を回帰テストで固定。特に「sandbox 不変」「App 面エスケープ」
  「iframe メッセージで特権操作を起こさない」は破ると主防御が崩れるため E2E で守る。

## 関連

前提: [ADR-0001](./0001-opaque-origin-iframe-isolation.md), [ADR-0004](./0004-inline-anchored-comments.md)。
コメント API の認可は本 ADR の原則1に従い、Content の view token を流用せず App 認証＋DB 権限検証で独立設計する。
