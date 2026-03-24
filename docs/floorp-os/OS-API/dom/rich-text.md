## リッチテキスト編集

### innerHTML の設定

`contenteditable` 要素の HTML コンテンツを設定する。

**エンドポイント**: `POST /instances/:id/setInnerHTML`

**リクエスト**:

```json
{
  "selector": ".rich-editor",
  "html": "<p>Hello <strong>world</strong></p>"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |
| `html`        | いいえ   | `string` | `""`       | 設定する HTML 文字列。   |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

**内部動作**:

1. 要素を取得する（`contenteditable` 属性が必要）。
2. `execCommand("insertHTML")` を試行する。
3. 失敗した場合、`innerHTML` を直接設定し、`input` + `change` イベントを発火する。

**注意**: **セキュリティリスク** — 設定した HTML 内の `<script>` タグは実行される可能性がある。信頼できない入力をサニタイズせずに渡さないこと。

---

### textContent の設定

`contenteditable` 要素のプレーンテキストを設定する。

**エンドポイント**: `POST /instances/:id/setTextContent`

**リクエスト**:

```json
{
  "selector": ".rich-editor",
  "text": "Plain text content"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |
| `text`        | いいえ   | `string` | `""`       | 設定するテキスト。       |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

**内部動作**:

1. 要素を取得する。
2. `execCommand("insertText")` を試行する。
3. 失敗した場合、`textContent` を直接設定し、`input` + `change` イベントを発火する。

**備考**: `setInnerHTML` と異なり、スクリプトインジェクションのリスクがない。プレーンテキストの設定にはこちらを推奨する。

---

### テキスト入力イベントの発火

リッチテキストエディタ向けの `InputEvent` を発火する。

**エンドポイント**: `POST /instances/:id/dispatchTextInput`

**リクエスト**:

```json
{
  "selector": ".prosemirror-editor",
  "text": "Inserted text"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                                    |
| ------------- | -------- | -------- | ---------- | --------------------------------------- |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。                          |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。                |
| `text`        | **はい** | `string` | —          | 入力するテキスト。省略時は 400 エラー。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (400):

```json
{
  "error": "text required"
}
```

**内部動作**:

1. 要素を取得する。
2. `beforeinput` イベントを発火する（`inputType: "insertText"`, キャンセル可能）。
3. **キャンセルされた場合**: エディタフレームワーク（Draft.js / ProseMirror / Slate 等）が自身で処理する。
4. **キャンセルされなかった場合**: `input` + `change` イベントを発火する。
5. **フォールバック**: `execCommand("insertText")` を試行する。

**備考**: Draft.js、ProseMirror、Slate など、`beforeinput` イベントをインターセプトして独自の DOM 操作を行うエディタ向けに設計されている。

---

## カスタムイベント

### 任意のイベントの発火

任意の DOM イベントを要素に対して発火する。

**エンドポイント**: `POST /instances/:id/dispatchEvent`

**リクエスト**:

```json
{
  "selector": "#my-component",
  "eventType": "custom:update",
  "options": {
    "bubbles": true,
    "cancelable": false
  }
}
```

| パラメータ           | 必須     | 型        | デフォルト | 説明                                    |
| -------------------- | -------- | --------- | ---------- | --------------------------------------- |
| `selector`           | 条件付き | `string`  | —          | CSS セレクタ。                          |
| `fingerprint`        | 条件付き | `string`  | —          | 要素フィンガープリント。                |
| `eventType`          | **はい** | `string`  | —          | イベントタイプ名。省略時は 400 エラー。 |
| `options`            | いいえ   | `object`  | —          | イベントオプション。                    |
| `options.bubbles`    | いいえ   | `boolean` | —          | バブリングするかどうか。                |
| `options.cancelable` | いいえ   | `boolean` | —          | キャンセル可能かどうか。                |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (400):

```json
{
  "error": "eventType required"
}
```

---
