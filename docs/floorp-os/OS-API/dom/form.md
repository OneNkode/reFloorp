## フォーム操作

### フォームの一括入力

フォーム内の複数フィールドを一括で入力する。

**エンドポイント**: `POST /instances/:id/fillForm`

**リクエスト**:

```json
{
  "formData": {
    "#username": "testuser",
    "#password": "secret123",
    "select[name='country']": "JP"
  },
  "typingMode": false,
  "typingDelayMs": 50
}
```

| パラメータ      | 必須   | 型                       | デフォルト | 説明                                                              |
| --------------- | ------ | ------------------------ | ---------- | ----------------------------------------------------------------- |
| `formData`      | いいえ | `Record<string, string>` | —          | キーが CSS セレクタまたはフィンガープリント、値が入力値のマップ。 |
| `typingMode`    | いいえ | `boolean`                | `false`    | `true` の場合、1 文字ずつ入力をシミュレートする。                 |
| `typingDelayMs` | いいえ | `number`                 | `50`       | `typingMode=true` 時の文字間の遅延（ミリ秒）。                    |

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

1. ドキュメントの準備完了を 5000ms 待機する。
2. `formData` の各キーについて:
   - フィンガープリント形式のキーは自動的に解決される。
   - 要素の出現を 3000ms 待機する。
   - `<select>` 要素: `selectOption` に委譲する。
   - `<input>` / `<textarea>` 要素: `inputElement` に委譲する。
3. 全フィールドの入力後、検証パスを実行する。
4. すべてのフィールドが正しく入力・検証された場合のみ `ok: true` を返却する。

**備考**: `typingMode=true` は JavaScript フレームワークが `input` イベントを監視している場合に有効。一括設定では検知されないケースがある。

---

### セレクトボックスの選択

`<select>` 要素のオプションを選択する。

**エンドポイント**: `POST /instances/:id/selectOption`

**リクエスト**:

```json
{
  "selector": "select[name='country']",
  "value": "JP"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |
| `value`       | いいえ   | `string` | `""`       | 選択する値。             |

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
2. 以下の優先順位でオプションをマッチングする:
   1. `option.value` の完全一致
   2. `option.textContent.trim()` の完全一致
   3. `option.label.trim()` の完全一致
   4. `textContent` の部分一致（大文字小文字を区別しない）
3. 一致したオプションを `selected` に設定する。
4. `input` イベントと `change` イベントを発火する。

---

### チェックボックス / ラジオボタンの設定

チェックボックスまたはラジオボタンの状態を設定する。

**エンドポイント**: `POST /instances/:id/setChecked`

**リクエスト**:

```json
{
  "selector": "#agree-terms",
  "checked": true
}
```

| パラメータ    | 必須     | 型        | デフォルト | 説明                     |
| ------------- | -------- | --------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string`  | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string`  | —          | 要素フィンガープリント。 |
| `checked`     | いいえ   | `boolean` | `false`    | 設定するチェック状態。   |

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

1. 要素を取得する（`checkbox` または `radio` のみ対応）。
2. 以下のプロパティを同期する:
   - `checked` プロパティ
   - `checked` 属性
   - `aria-checked` 属性
   - `defaultChecked` プロパティ
3. `radio` + `checked=true` の場合、`click` イベントも発火する。
4. `input` イベントと `change` イベントを発火する。

**備考**: `checkbox` と `radio` 以外の要素に対して使用すると失敗する。

---

### 入力フィールドのクリア

入力フィールドの値を空にする。

**エンドポイント**: `POST /instances/:id/clearInput`

**リクエスト**:

```json
{
  "selector": "#search-box"
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
2. `value` を空文字列に設定する。
3. `input` イベントと `change` イベントを発火する。

---

### フォームの送信

フォームを送信する。

**エンドポイント**: `POST /instances/:id/submit`

**リクエスト**:

```json
{
  "selector": "#login-form"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                                                         |
| ------------- | -------- | -------- | ---------- | ------------------------------------------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。フォーム要素またはフォーム内の要素を指定可能。 |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。                                     |

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
2. `requestSubmit()` を試行する（バリデーション付き送信）。
3. `requestSubmit()` が利用できない場合、`submit()` にフォールバックする。

**備考**: `requestSubmit()` は HTML フォームバリデーションをトリガーする。`submit()` はバリデーションをバイパスする。

---

### 値の取得

要素の現在の値を取得する。

**エンドポイント**: `GET /instances/:id/value`

**クエリパラメータ**:

| パラメータ    | 必須     | 型       | デフォルト | 説明                     |
| ------------- | -------- | -------- | ---------- | ------------------------ |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。           |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。 |

**成功レスポンス** (200):

```json
{
  "value": "current input value"
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
2. `<input>`、`<textarea>`、`<select>` の場合は `.value` を返却する。
3. それ以外の要素は `.textContent` にフォールバックする。

---

## テキスト入力

### 入力

要素にテキストを入力する。

**エンドポイント**: `POST /instances/:id/input`

**リクエスト**:

```json
{
  "selector": "#email",
  "value": "user@example.com",
  "typingMode": false,
  "typingDelayMs": 25
}
```

| パラメータ      | 必須     | 型        | デフォルト | 説明                                         |
| --------------- | -------- | --------- | ---------- | -------------------------------------------- |
| `selector`      | 条件付き | `string`  | —          | CSS セレクタ。                               |
| `fingerprint`   | 条件付き | `string`  | —          | 要素フィンガープリント。                     |
| `value`         | **はい** | `string`  | —          | 入力する値。省略時は 400 エラー。            |
| `typingMode`    | いいえ   | `boolean` | `false`    | `true` の場合、1 文字ずつ入力する。          |
| `typingDelayMs` | いいえ   | `number`  | `25`       | `typingMode=true` 時の文字間遅延（ミリ秒）。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (400):

```json
{
  "error": "value required"
}
```

**内部動作**:

1. 要素を取得する。
2. `HTMLSelectElement` の場合は `selectOption` に委譲する。
3. **`typingMode=true` の場合** — 1 文字ずつ:
   1. `beforeinput` イベント発火
   2. `keydown` イベント発火
   3. `value` に 1 文字追加
   4. `input` イベント発火
   5. `keyup` イベント発火
   6. `typingDelayMs` 待機
   7. 全文字完了後、`change` + `blur` を発火
4. **`typingMode=false` の場合** — 一括設定:
   1. `beforeinput` イベント発火（全文字列）
   2. `value` を一括設定
   3. `input` イベント発火
   4. `change` イベント発火
   5. `blur` イベント発火
5. **フォールバック**: 上記が失敗した場合、`execCommand("insertText")` を試行する。
6. 要素が `disabled` の場合は `false` を返却する。

---

### キー入力

キーボードイベントを発火する。

**エンドポイント**: `POST /instances/:id/pressKey`

**リクエスト**:

```json
{
  "key": "Enter"
}
```

| パラメータ | 必須     | 型       | デフォルト | 説明                          |
| ---------- | -------- | -------- | ---------- | ----------------------------- |
| `key`      | **はい** | `string` | —          | キー名。省略時は 400 エラー。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (400):

```json
{
  "error": "key required"
}
```

**キー名の形式**:

- 単一キー: `"Enter"`, `"a"`, `"Space"`, `"Tab"`, `"Escape"`, `"Backspace"`
- 修飾キー付きコンボ: `"Control+Shift+a"`, `"Meta+k"`, `"Alt+F4"`

**キーコードのマッピング**:

| 入力      | マッピング先       |
| --------- | ------------------ |
| `a`〜`z`  | `KeyA`〜`KeyZ`     |
| `0`〜`9`  | `Digit0`〜`Digit9` |
| `Control` | `ControlLeft`      |
| `Shift`   | `ShiftLeft`        |
| `Alt`     | `AltLeft`          |
| `Meta`    | `MetaLeft`         |

**内部動作**:

1. キー文字列を `+` で分割する。
2. 修飾キーの `keydown` イベントを順番に発火する。
3. メインキーの `keydown` → `keypress` → `keyup` を発火する。
4. 修飾キーの `keyup` を逆順に発火する。

**備考**: セレクタを受け取らない。現在フォーカスされている要素、またはフォーカスがない場合は `document` に対してイベントが発火される。

---

## ファイルアップロード

### ファイルのアップロード

ファイル入力要素にファイルを設定する。

**エンドポイント**: `POST /instances/:id/uploadFile`

**リクエスト**:

```json
{
  "selector": "input[type='file']",
  "filePath": "/path/to/document.pdf"
}
```

| パラメータ    | 必須     | 型       | デフォルト | 説明                                                  |
| ------------- | -------- | -------- | ---------- | ----------------------------------------------------- |
| `selector`    | 条件付き | `string` | —          | CSS セレクタ。                                        |
| `fingerprint` | 条件付き | `string` | —          | 要素フィンガープリント。                              |
| `filePath`    | **はい** | `string` | —          | アップロードするファイルのパス。省略時は 400 エラー。 |

**成功レスポンス** (200):

```json
{
  "ok": true
}
```

**失敗レスポンス** (400):

```json
{
  "error": "filePath required"
}
```

**内部動作**:

1. 要素を取得する（`input[type=file]` のみ対応）。
2. 親プロセスでファイルを読み込む。
3. ファイル拡張子から MIME タイプを判定する。
4. `Cu.cloneInto` でコンテンツスコープにマーシャリングする。
5. `Blob` → `File` オブジェクトを生成する。
6. `mozSetFileArray` でファイル入力に設定する。

**対応 MIME タイプ**:

| 拡張子          | MIME タイプ                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `.txt`          | `text/plain`                                                              |
| `.pdf`          | `application/pdf`                                                         |
| `.png`          | `image/png`                                                               |
| `.jpg`, `.jpeg` | `image/jpeg`                                                              |
| `.gif`          | `image/gif`                                                               |
| `.webp`         | `image/webp`                                                              |
| `.svg`          | `image/svg+xml`                                                           |
| `.json`         | `application/json`                                                        |
| `.xml`          | `application/xml`                                                         |
| `.html`         | `text/html`                                                               |
| `.css`          | `text/css`                                                                |
| `.js`           | `application/javascript`                                                  |
| `.zip`          | `application/zip`                                                         |
| `.doc`          | `application/msword`                                                      |
| `.docx`         | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.xls`          | `application/vnd.ms-excel`                                                |
| `.xlsx`         | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       |
| その他          | `application/octet-stream`                                                |

---
