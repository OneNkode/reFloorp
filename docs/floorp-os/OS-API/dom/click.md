## クリック系

### クリック

要素をクリックする。

**エンドポイント**: `POST /instances/:id/click`

**リクエスト**:

```json
{
  "selector": "#submit-btn",
  "button": "left",
  "clickCount": 1,
  "force": false,
  "stabilityTimeout": 100
}
```

| パラメータ         | 必須     | 型                                  | デフォルト | 説明                                                                               |
| ------------------ | -------- | ----------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `selector`         | 条件付き | `string`                            | —          | CSS セレクタ。`fingerprint` と排他。                                               |
| `fingerprint`      | 条件付き | `string`                            | —          | 要素フィンガープリント。`selector` と排他。                                        |
| `button`           | いいえ   | `"left"` \| `"right"` \| `"middle"` | `"left"`   | マウスボタン。                                                                     |
| `clickCount`       | いいえ   | `number`                            | `1`        | クリック回数。2 でダブルクリック相当。                                             |
| `force`            | いいえ   | `boolean`                           | `false`    | `true` の場合、操作可能性チェック・スクロール・安定性待機をスキップする。          |
| `stabilityTimeout` | いいえ   | `number`                            | `100`      | 要素の位置安定性を確認する待機時間（ミリ秒）。`0` で安定性チェックをスキップする。 |

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

**失敗レスポンス** (400):

```json
{
  "error": "selector or fingerprint required"
}
```

**内部動作**:

1. **要素の検索**: `deepQuerySelector` で要素を取得する。タイムアウト内に 3 回まで再試行する。
2. **生存確認**: 要素が DOM ツリーに存在するかを確認する。
3. **操作可能性チェック** (`force=false` の場合): `display` が `none` でないこと、`visibility` が `hidden` でないこと、サイズが 0 より大きいことを検証する。
4. **スクロール** (`force=false` の場合): `scrollIntoView({ block: "center" })` で要素をビューポート中央に移動する。
5. **位置安定性待機** (`force=false` かつ `stabilityTimeout > 0` の場合): `getBoundingClientRect()` を比較し、2px 以内の差分に収束するまで待機する。
6. **座標の計算**: `getBoundingClientRect()` の中心座標を算出する。
7. **イベント発火**: `nsIDOMWindowUtils.sendMouseEvent` で `mousemove` → (`mousedown` + `mouseup`) × `clickCount` を送信する。
8. **フォールバック**: `sendMouseEvent` が失敗した場合、レガシー DOM `.click()` を使用する。

**備考**:

- `force=true` はステップ 3〜5 をスキップする。非表示要素やアニメーション中の要素を強制クリックする場合に使用する。
- `stabilityTimeout=0` はステップ 5 のみをスキップする。
- Xray 環境の制限により、`elementFromPoint` は信頼性が低い。`sendMouseEvent` はネイティブのヒットテストを使用する。

---

### ダブルクリック

要素をダブルクリックする。内部的には `clickElement` を `clickCount: 2` で呼び出す。

**エンドポイント**: `POST /instances/:id/doubleClick`

**リクエスト**:

```json
{
  "selector": ".editable-cell"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (500):

```json
{
  "error": "string"
}
```

**内部動作**: `click` エンドポイントと同一。`clickCount: 2` が自動設定される。

---

### 右クリック

要素を右クリックする。内部的には `clickElement` を `button: "right"` で呼び出す。

**エンドポイント**: `POST /instances/:id/rightClick`

**リクエスト**:

```json
{
  "selector": ".context-menu-target"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (500):

```json
{
  "error": "string"
}
```

**内部動作**: `click` エンドポイントと同一。`button: "right"` が自動設定される。

---

## マウス操作

### ホバー

要素上にマウスカーソルを移動する。

**エンドポイント**: `POST /instances/:id/hover`

**リクエスト**:

```json
{
  "selector": ".tooltip-trigger"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

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
2. `getBoundingClientRect()` で中心座標を算出する。
3. 以下のイベントを順番に発火する:
   - `mouseenter`（バブリングなし）
   - `mouseover`（バブリング）
   - `mousemove`（バブリング）
4. すべてのイベントに `clientX`/`clientY` として要素中心座標を設定する。

---

### スクロール

要素が表示されるまでスクロールする。

**エンドポイント**: `POST /instances/:id/scrollTo`

**リクエスト**:

```json
{
  "selector": "#footer"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

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
2. `scrollIntoView({ behavior: "smooth", block: "center" })` を呼び出す。

---

### フォーカス

要素にフォーカスを設定する。

**エンドポイント**: `POST /instances/:id/focus`

**リクエスト**:

```json
{
  "selector": "#username"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (500):

```json
{
  "error": "string"
}
```

**内部動作**:

1. `scrollIntoView()` で要素をビューポートに移動する。
2. `element.focus()` を呼び出す。
3. `FocusEvent("focus")` を発火する（バブリングなし）。
4. `FocusEvent("focusin")` を発火する（バブリング）。

---

### ドラッグ＆ドロップ

要素を別の要素にドラッグ＆ドロップする。

**エンドポイント**: `POST /instances/:id/dragAndDrop`

**リクエスト**:

```json
{
  "sourceSelector": ".draggable-item",
  "targetSelector": ".drop-zone"
}
```

| パラメータ          | 必須     | 型       | デフォルト | 説明                             |
| ------------------- | -------- | -------- | ---------- | -------------------------------- |
| `sourceSelector`    | 条件付き | `string` | —          | ドラッグ元の CSS セレクタ。      |
| `sourceFingerprint` | 条件付き | `string` | —          | ドラッグ元のフィンガープリント。 |
| `targetSelector`    | 条件付き | `string` | —          | ドロップ先の CSS セレクタ。      |
| `targetFingerprint` | 条件付き | `string` | —          | ドロップ先のフィンガープリント。 |

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

1. ソース要素とターゲット要素を取得する。
2. 各要素の `getBoundingClientRect()` の中心座標を算出する。
3. `DataTransfer` オブジェクトを生成する。
4. ソース要素でイベントを発火する:
   - `dragstart`（バブリング、キャンセル可能）
   - `drag`（バブリング、キャンセル可能）
5. ターゲット要素でイベントを発火する:
   - `dragenter`（バブリング、キャンセル可能）
   - `dragover`（バブリング、キャンセル可能）
   - `drop`（バブリング、キャンセル可能）
6. ソース要素で `dragend` を発火する（バブリング、ターゲット座標を使用）。

**備考**: すべてのイベントに `DataTransfer` オブジェクトが付与される。座標は各要素の `getBoundingClientRect()` 中心値を使用する。

---
