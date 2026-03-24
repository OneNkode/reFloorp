## 要素の状態取得

### 要素の表示状態

要素が視覚的に表示されているかを確認する。

**エンドポイント**: `GET /instances/:id/isVisible`

**クエリパラメータ**:

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "visible": true
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

**内部動作**:

以下のすべての条件を満たす場合に `visible: true` を返却する:

1. `display` が `"none"` でない。
2. `visibility` が `"hidden"` でない。
3. `opacity` が `"0"` でない。
4. `width` が 0 より大きい。
5. `height` が 0 より大きい。

---

### 要素の有効状態

要素が有効（操作可能）かを確認する。

**エンドポイント**: `GET /instances/:id/isEnabled`

**クエリパラメータ**:

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "enabled": true
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

---

### 属性の取得

要素の属性値を取得する。

**エンドポイント**: `GET /instances/:id/attribute`

**クエリパラメータ**:

| パラメータ    | 必須     | 型       | デフォルト | 説明                                  |
| ------------- | -------- | -------- | ---------- | ------------------------------------- |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。                        |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。              |
| `name`        | **はい** | `string` | —          | 取得する属性名。省略時は 400 エラー。 |

**成功レスポンス** (200):

```json
{
  "value": "attribute-value"
}
```

**属性が存在しない場合** (200):

```json
{
  "value": null
}
```

**失敗レスポンス** (400):

```json
{
  "error": "name required"
}
```

---

### 要素の HTML 取得

要素の `outerHTML` を取得する。

**エンドポイント**: `GET /instances/:id/element`

**クエリパラメータ**:

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "element": "<div class=\"example\">...</div>"
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

---

### 要素のテキスト取得

要素の `textContent` を取得する。

**エンドポイント**: `GET /instances/:id/elementText`

**クエリパラメータ**:

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "text": "Trimmed text content"
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

**備考**: 返却値は `textContent.trim()` の結果。前後の空白は除去される。

> 複数要素の一括取得 (`GET /instances/:id/elements`) は [retrieval.md](./retrieval.md) を参照。

---
