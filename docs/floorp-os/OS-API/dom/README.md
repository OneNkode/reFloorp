# Floorp OS API — DOM 取得・操作リファレンス

Floorp OS API はローカル HTTP サーバー (`127.0.0.1:58261`) でブラウザの DOM を取得・操作する API を提供する。

## ユースケース

| やりたいこと                           | 参照先                                   |
| -------------------------------------- | ---------------------------------------- |
| ブラウザタブの作成・管理               | [tab-management.md](./tab-management.md) |
| ページのテキスト・構造を取得したい     | [retrieval.md](./retrieval.md)           |
| 要素をクリック・ホバー・ドラッグしたい | [click.md](./click.md)                   |
| フォームに入力・送信したい             | [form.md](./form.md)                     |
| リッチテキストエディタに入力したい     | [rich-text.md](./rich-text.md)           |
| ページ遷移・要素の出現を待ちたい       | [navigation.md](./navigation.md)         |
| 要素の表示/有効状態を確認したい        | [element-state.md](./element-state.md)   |
| Cookie の読み書き・アラート処理        | [cookie-browser.md](./cookie-browser.md) |
| Fingerprint の仕組みを理解したい       | [fingerprint.md](./fingerprint.md)       |
| API のパフォーマンスを最適化したい     | [performance.md](./performance.md)       |
| 実際の出力を見たい (Gmail)             | [examples-gmail.md](./examples-gmail.md) |

## 目次

### ページ内容の取得

- [retrieval.md](./retrieval.md) — Text (Markdown), ax-tree, Article, HTML, Screenshot

### 要素の操作

- [tab-management.md](./tab-management.md) — タブの作成・アタッチ・破棄・一覧
- [click.md](./click.md) — Click, Double Click, Right Click, Hover, Scroll To, Focus, Drag & Drop
- [form.md](./form.md) — Fill Form, Select Option, Set Checked, Clear Input, Submit, Get Value, Input, Press Key, Upload File
- [rich-text.md](./rich-text.md) — Set innerHTML, Set textContent, Dispatch Text Input, Dispatch Event
- [navigation.md](./navigation.md) — Navigate, Wait For Element, Wait For Ready, Wait For Network Idle
- [element-state.md](./element-state.md) — Is Visible, Is Enabled, Get Attribute, Get Element, Get Element Text
- [cookie-browser.md](./cookie-browser.md) — Get Cookies, Set Cookie, Accept/Dismiss Alert, Clear Effects

### ガイド

- [fingerprint.md](./fingerprint.md) — Fingerprint の仕組み・安定性・使い方
- [performance.md](./performance.md) — 推奨パターンとベンチマーク
- [examples-gmail.md](./examples-gmail.md) — Gmail での実際の出力サンプル

## 要素の指定方法

ほとんどの操作エンドポイントは要素を **`selector`** (CSS セレクタ) または **`fingerprint`** で指定する。両方を省略すると 400 エラー。両方指定した場合は `selector` が優先。

| パラメータ    | 型       | 説明                                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------------------ |
| `selector`    | `string` | CSS セレクタ。Shadow DOM 内も `deepQuerySelector` で自動探索 (open shadow root のみ) |
| `fingerprint` | `string` | 要素の一意ハッシュ。8 文字または 16 文字の小文字英数字。`GET /text` で取得           |

詳細は [fingerprint.md](./fingerprint.md) を参照。

## パスのプレフィックス

本ドキュメントのエンドポイントパスは `/instances/:id/...` 形式で記載している。実際のリクエストでは、サービスに応じたプレフィックスを付与する。

| サービス | プレフィックス | 例 |
|---|---|---|
| Tab | `/tabs` | `POST /tabs/instances/:id/click` |
| Scraper | `/scraper` | `POST /scraper/instances/:id/click` |

タブ管理エンドポイント (`/tabs/list`, `/tabs/instances`, `/tabs/attach` 等) は常に `/tabs` プレフィックスを使用する。

## エラーレスポンス

全エンドポイント共通。

| HTTP Status | 意味                            | レスポンス例                                      |
| ----------- | ------------------------------- | ------------------------------------------------- |
| 200         | 成功                            | `{ "ok": true }`                                  |
| 400         | リクエスト不正                  | `{ "error": "selector or fingerprint required" }` |
| 404         | インスタンス/要素が見つからない | `{ "error": "fingerprint not found" }`            |
| 501         | このサービスでは未サポート      | `{ "error": "pressKey not supported" }`           |
| 500         | 内部エラー                      | `{ "error": "..." }`                              |

## バリデーション定数

| 定数                 | 値                                           |
| -------------------- | -------------------------------------------- |
| タイムアウト範囲     | 0〜60,000 ms                                 |
| Fingerprint 形式     | `/^[a-z0-9]{8}([a-z0-9]{8})?$/`              |
| 許可 URL スキーム    | `http:`, `https:` + `about:blank` (完全一致) |
| リクエストボディ上限 | 2 MB                                         |
