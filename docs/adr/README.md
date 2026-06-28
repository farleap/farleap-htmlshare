# Architecture Decision Records

ここには、farleap-htmlshare の **重い設計判断を「決定の経緯ごと」凍結した記録** を置く。

## DESIGN.md との棲み分け

| | [`DESIGN.md`](../DESIGN.md) | ADR（このディレクトリ） |
|---|---|---|
| 時制 | **現在形**「いま・これからどうあるべきか」 | **過去形**「あの時なぜこう決めたか」 |
| 寿命 | 生きた正典。実装が進むたび更新される | 不変。一度書いたら原則変えない（覆すときは新 ADR で `Superseded`） |
| 粒度 | システム全体の像（What/Why の俯瞰） | 1決定1ファイル（文脈・選択肢・却下理由・結果） |
| 読む動機 | 「完成形はどうなってる？」 | 「なぜ別の方法じゃないの？」 |

DESIGN.md は §5 に ADR の一覧と要約を持ち、詳細はここへリンクする。重複は要約レベルに留める。

## フォーマット

[Michael Nygard の ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) をベースに、
代替案を明示する MADR 寄りの構成を使う：

```
# ADR-NNNN: タイトル
- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD
## Context（なぜこの決定が必要だったか）
## Considered Options（検討した選択肢）
## Decision（何を決めたか）
## Consequences（結果・トレードオフ・受け入れたコスト）
```

新しい決定は連番で追加する。既存の決定を覆すときは、古い ADR を消さず Status を `Superseded by ADR-XXXX` にして残す。

## 一覧

| ADR | タイトル | Status |
|---|---|---|
| [0001](./0001-opaque-origin-iframe-isolation.md) | 不透明オリジン iframe によるプレビュー隔離 | Accepted |
| [0002](./0002-single-worker-plane-separation.md) | 単一 Worker・パス分離による面の同居 | Accepted |
| [0003](./0003-stateless-signed-view-tokens.md) | ステートレス HMAC 署名トークンによる配信認可 | Accepted |
| [0004](./0004-inline-anchored-comments.md) | インライン（範囲アンカー）コメント方式 | Accepted |
| [0005](./0005-version-pinned-comments-and-reanchoring.md) | コメントの版固定と「退避して保持」な再アンカー | Accepted |
