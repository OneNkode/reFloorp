# ページコンテンツ取得 API リファレンス

OS API が提供する DOM 読み取りエンドポイントの一覧と使い分けガイド。

---

## やりたいこと逆引き

| やりたいこと                                 | 使う API      | 理由                                                   |
| -------------------------------------------- | ------------- | ------------------------------------------------------ |
| ページ全体のテキストを AI に伝え操作もしたい | Text (full)   | 初回のみ全体構造を把握し、以降は scoped に切り替える   |
| メール一覧だけ取得したい                     | Text (scoped) | `selector` で範囲を限定しサイズと応答時間を削減        |
| ボタンやリンクを探したい                     | ax-tree       | `role` / `name` で構造的に探せる。操作対象の特定に最適 |
| ニュース記事の本文だけ読みたい               | Article       | Readability で広告・ナビを自動除去し Markdown を返す   |
| Shadow DOM サイトの内容確認                  | Screenshot    | 描画結果をキャプチャするため Shadow DOM の壁を越える   |
| 特定要素の outerHTML をパースしたい          | HTML (scoped) | `selector` 指定で 1 要素だけ高速に返す                 |

---

## API サマリー

| API           | 推奨度     | 応答時間 (Gmail) | サイズ | 主な用途                       |
| ------------- | ---------- | ---------------- | ------ | ------------------------------ |
| ax-tree       | **最推奨** | 0.27 s           | 134 KB | 構造把握・操作対象の特定       |
| Text (scoped) | 推奨       | < 1 s            | 可変   | 範囲限定テキスト + fingerprint |
| Article       | 推奨       | 0.36 s           | 65 KB  | 記事コンテンツ抽出             |
| Screenshot    | 状況次第   | 0.17 s           | 396 KB | 視覚確認・Shadow DOM           |
| Text (full)   | 初回のみ   | 1.86 s           | 124 KB | ページ全体の把握               |
| HTML (scoped) | 限定的     | < 50 ms          | 可変   | 生 DOM が必要なときのみ        |
| HTML (full)   | **非推奨** | 1.33 s           | 787 KB | 重い・class 名が難読化される   |

---

## Text API

ページのテキストコンテンツを Markdown 形式で返す。GET (レガシー) と POST (推奨) の 2 つのインターフェースがある。

### GET /text (レガシー)

クエリパラメータのみで動作する簡易版。後方互換のために残されている。

| パラメータ           | 型      | 説明                                                           |
| -------------------- | ------- | -------------------------------------------------------------- |
| `includeSelectorMap` | boolean | `true` にすると末尾に fingerprint → CSS セレクタの対応表を付与 |

```
GET /text?includeSelectorMap=true
```

```json
{
  "text": "# Gmail\n\nInbox (3)\n..."
}
```

> **注**: `includeSelectorMap=true` の場合、セレクタマップは text の末尾に Markdown コメントとして埋め込まれる (別フィールドではない)

### POST /text (推奨)

全オプションを JSON ボディで指定できる。GET にはない `mode` / `selector` / `viewportMargin` / `enableFingerprints` が利用可能。

| パラメータ           | 型                                    | デフォルト | 説明                                                        |
| -------------------- | ------------------------------------- | ---------- | ----------------------------------------------------------- |
| `mode`               | `"full"` \| `"scoped"` \| `"visible"` | `"full"`   | 取得範囲。`scoped` は `selector` 必須                       |
| `selector`           | string                                | —          | `mode: "scoped"` 時の CSS セレクタ                          |
| `viewportMargin`     | number                                | `0`        | `mode: "visible"` 時にビューポート外をどこまで含めるか (px) |
| `enableFingerprints` | boolean                               | `true`     | `false` にすると `<!--fp:...-->` コメントを省略しサイズ削減 |
| `includeSelectorMap` | boolean                               | `false`    | fingerprint → CSS セレクタの対応表を付与                    |

#### GET と POST の違い

- GET は `includeSelectorMap` のみ制御可能。mode は常に `full` 相当。
- POST は取得範囲 (`mode`)、fingerprint の有無、viewport マージンなど全オプションを制御できる。
- 新規実装では POST を使うこと。

#### リクエスト例

```http
POST /text
Content-Type: application/json

{
  "mode": "scoped",
  "selector": "table.email-list",
  "enableFingerprints": true,
  "includeSelectorMap": true
}
```

#### レスポンス例

```json
{
  "text": "| From | Subject | Date |\n|---|---|---|\n| Alice <!--fp:a1b2c3d4--> | Meeting tomorrow | Mar 24 |\n..."
}
```

> **注**: `includeSelectorMap=true` の場合、セレクタマップは text の末尾に Markdown コメントとして埋め込まれる (別フィールドではない)

fingerprint の仕組みについては [fingerprint.md](./fingerprint.md) を参照。

---

## ax-tree API

アクセシビリティツリーを JSON で返す。ページの論理構造と操作可能な要素を効率的に取得できる。

### GET /ax-tree

| パラメータ        | 型      | デフォルト | 説明                                                              |
| ----------------- | ------- | ---------- | ----------------------------------------------------------------- |
| `interestingOnly` | boolean | `true`     | `true` の場合、操作不能な装飾ノードを省略し出力を圧縮する         |
| `root`            | string  | —          | 部分ツリーのルートとなる CSS セレクタ。省略するとドキュメント全体 |

#### レスポンス例

```json
{
  "tree": {
    "role": "WebArea",
    "name": "Inbox - Gmail",
    "children": [
      {
        "role": "banner",
        "name": "",
        "children": [
          { "role": "button", "name": "Main menu" },
          {
            "role": "search",
            "name": "Search mail",
            "children": [{ "role": "textbox", "name": "Search mail" }]
          }
        ]
      }
    ]
  }
}
```

#### ノード属性一覧

| 属性       | 型      | 説明                                                      |
| ---------- | ------- | --------------------------------------------------------- |
| `role`     | string  | ARIA ロール (`button`, `link`, `textbox`, `heading` など) |
| `name`     | string  | アクセシブルネーム (ボタンのラベル、リンクテキストなど)   |
| `children` | array   | 子ノードの配列                                            |
| `level`    | number  | 見出しレベル (`heading` の場合のみ)                       |
| `checked`  | boolean | チェック状態 (`checkbox`, `radio`)                        |
| `expanded` | boolean | 展開状態 (`treeitem`, `combobox`)                         |
| `selected` | boolean | 選択状態 (`tab`, `option`)                                |
| `disabled` | boolean | 無効状態                                                  |
| `value`    | string  | 現在の値 (`textbox`, `slider`)                            |

---

## Article API

Mozilla Readability を使い、記事コンテンツのみを Markdown で抽出する。広告・ナビ・サイドバーは自動除去される。

### GET /article

パラメータなし。

#### レスポンス例

```json
{
  "title": "Floorp 12 Release Notes",
  "byline": "Floorp Team",
  "markdown": "# Floorp 12 Release Notes\n\nWe are excited to announce...",
  "length": 4523
}
```

#### 適した対象

- ニュースサイト、ブログ、Wikipedia
- Gmail では受信メール一覧を記事として抽出する

#### 制限

Readability が「記事ではない」と判定したページでは `null` を返す。SPA のダッシュボードやフォーム画面には不向き。

---

## HTML API

生の HTML を返す。class 名が難読化されたサイト (Gmail など) では解析が困難なため、通常は Text や ax-tree を優先すること。

### GET /html

ページ全体の `document.documentElement.outerHTML` を返す。

```json
{
  "html": "<!DOCTYPE html><html>..."
}
```

**警告**: Gmail では 787 KB / 1.33 s かかる。class 名は `aeJ`, `bkK` のように難読化されており CSS セレクタとしての利用価値が低い。

### GET /html?selector=

指定セレクタの `outerHTML` のみを返す。scoped は高速 (< 50 ms)。

```
GET /html?selector=div.main-content
```

```json
{
  "html": "<div class=\"main-content\">...</div>"
}
```

---

## Screenshot API

ページまたは要素のスクリーンショットを PNG (Base64) で返す。Shadow DOM の内容も正しくキャプチャされる。

### エンドポイント一覧

| エンドポイント                 | メソッド | 説明                                   |
| ------------------------------ | -------- | -------------------------------------- |
| `/screenshot`                  | GET      | 現在のビューポートのスクリーンショット |
| `/fullPageScreenshot`          | GET      | ページ全体 (スクロール分を含む)        |
| `/elementScreenshot?selector=` | GET      | 指定要素のみ                           |
| `/regionScreenshot`            | POST     | 座標指定の矩形領域                     |

### レスポンス例

```json
{
  "image": "data:image/png;base64,iVBORw0KGgo..."
}
```

### POST /regionScreenshot ボディ

```json
{
  "rect": {
    "x": 100,
    "y": 200,
    "width": 400,
    "height": 300
  }
}
```

Shadow DOM を使うカスタムコンポーネント (Web Components) もレンダリング結果としてキャプチャされるため、ax-tree や Text で内部が見えない場合の代替手段になる。

---

## 要素取得エンドポイント

個別要素の取得・検索に使う軽量エンドポイント群。

### GET /element

単一要素の `outerHTML` を返す。詳細は [element-state.md](./element-state.md) を参照。

### GET /elements

複数要素の `outerHTML` を配列で返す。

| パラメータ    | 型     | 説明                            |
| ------------- | ------ | ------------------------------- |
| `selector`    | string | CSS セレクタ (マッチする全要素) |
| `fingerprint` | string | fingerprint                     |

```json
{
  "elements": ["<li>Item 1</li>", "<li>Item 2</li>"]
}
```

### GET /elementByText

テキストコンテンツで要素を検索する。

| パラメータ | 型     | 説明                    |
| ---------- | ------ | ----------------------- |
| `text`     | string | 検索テキスト (部分一致) |

```json
{
  "element": "<a href=\"/inbox\">Inbox (3)</a>"
}
```

### GET /elementTextContent

要素の `textContent` だけを返す。詳細は [element-state.md](./element-state.md) を参照。

### GET /resolveFingerprint

fingerprint を CSS セレクタに逆引きする。デバッグや fingerprint の安定性確認に使う。

| パラメータ    | 型     | 説明                               |
| ------------- | ------ | ---------------------------------- |
| `fingerprint` | string | 8 文字または 16 文字の fingerprint |

```json
{
  "selector": "div.nav > a:nth-child(2)"
}
```

