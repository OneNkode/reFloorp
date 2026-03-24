## Cookie 管理

### Cookie の一覧取得

インスタンスのページに関連する Cookie を取得する。

**エンドポイント**: `GET /instances/:id/cookies`

**パスパラメータ**:

| パラメータ | 必須     | 型       | 説明              |
| ---------- | -------- | -------- | ----------------- |
| `id`       | **はい** | `string` | インスタンス ID。 |

**リクエスト**: パラメータなし。

**成功レスポンス** (200):

```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "secure": true,
      "httpOnly": true,
      "sameSite": "Lax",
      "expirationDate": 1735689600
    }
  ]
}
```

**失敗レスポンス** (404):

```json
{
  "error": "Instance not found"
}
```

---

### Cookie の設定

Cookie を設定する。

**エンドポイント**: `POST /instances/:id/cookie`

**リクエスト**:

```json
{
  "name": "preference",
  "value": "dark_mode",
  "domain": ".example.com",
  "path": "/",
  "secure": true,
  "httpOnly": false,
  "sameSite": "Lax",
  "expirationDate": 1735689600
}
```

| パラメータ       | 必須     | 型                                | デフォルト | 説明                                             |
| ---------------- | -------- | --------------------------------- | ---------- | ------------------------------------------------ |
| `name`           | **はい** | `string`                          | —          | Cookie 名。                                      |
| `value`          | **はい** | `string`                          | —          | Cookie 値。                                      |
| `domain`         | いいえ   | `string`                          | —          | ドメイン。省略時は現在のドメイン。               |
| `path`           | いいえ   | `string`                          | —          | パス。                                           |
| `secure`         | いいえ   | `boolean`                         | —          | HTTPS のみで送信するかどうか。                   |
| `httpOnly`       | いいえ   | `boolean`                         | —          | JavaScript からアクセス不可にするかどうか。      |
| `sameSite`       | いいえ   | `"Strict"` \| `"Lax"` \| `"None"` | —          | SameSite 属性。                                  |
| `expirationDate` | いいえ   | `number`                          | —          | 有効期限（UNIX 秒）。省略時はセッション Cookie。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (400):

```json
{
  "error": "name and value required"
}
```

---

## ブラウザ操作

### アラートの承認

表示中のアラートダイアログを承認（OK）する。

**エンドポイント**: `POST /instances/:id/acceptAlert`

**パスパラメータ**:

| パラメータ | 必須     | 型       | 説明              |
| ---------- | -------- | -------- | ----------------- |
| `id`       | **はい** | `string` | インスタンス ID。 |

**リクエスト**: パラメータなし。

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (500):

```json
{
  "error": "No alert present"
}
```

---

### アラートの却下

表示中のアラートダイアログを却下（キャンセル）する。

**エンドポイント**: `POST /instances/:id/dismissAlert`

**パスパラメータ**:

| パラメータ | 必須     | 型       | 説明              |
| ---------- | -------- | -------- | ----------------- |
| `id`       | **はい** | `string` | インスタンス ID。 |

**リクエスト**: パラメータなし。

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (500):

```json
{
  "error": "No alert present"
}
```

---

### エフェクトのクリア

インスタンスに適用されたハイライトやオーバーレイをすべて除去する。

**エンドポイント**: `POST /instances/:id/clearEffects`

**パスパラメータ**:

| パラメータ | 必須     | 型       | 説明              |
| ---------- | -------- | -------- | ----------------- |
| `id`       | **はい** | `string` | インスタンス ID。 |

**リクエスト**: パラメータなし。

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

1. DOM に挿入されたハイライト要素とオーバーレイ要素を検索する。
2. すべてのエフェクト要素を DOM から削除する。

---
