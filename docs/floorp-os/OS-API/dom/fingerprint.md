# Fingerprint ガイド

DOM 要素を一意に識別する 8 文字のハッシュ。CSS セレクタに代わる安定した要素参照手段を提供する。

---

## やりたいこと逆引き

| やりたいこと                          | fingerprint の使い方                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Markdown 読んで「この要素をクリック」 | `<!--fp:a1b2c3d4-->` をコピーして `POST /click { "fingerprint": "a1b2c3d4" }` |
| CSS セレクタが不安定                  | テキストベースハッシュなので DOM 構造変化に強い                               |
| AI エージェントに操作指示             | AI が Text 出力から fp を読み取り、そのまま操作エンドポイントに渡す           |
| 同じメールを次回も同じ ID で参照      | テキストコンテンツが同一なら fp は 100% 再現される                            |
| CSS セレクタが難読化サイト            | fp なら 8 文字で済み、難読化の影響を受けない                                  |

---

## 概要

fingerprint は DOM 要素のテキストや構造から算出される短いハッシュ文字列。Text API の出力に `<!--fp:XXXXXXXX-->` の形式で埋め込まれる。

### 例

```markdown
Inbox (3) <!--fp:a1b2c3d4-->
```

この fingerprint を使ってクリック操作を行う:

```http
POST /click
Content-Type: application/json

{
  "fingerprint": "a1b2c3d4"
}
```

OS API は fingerprint を受け取ると内部で CSS セレクタに解決し、対象要素に対してアクションを実行する。

---

## CSS セレクタとの比較

| 特性                 | CSS セレクタ                              | Fingerprint                               |
| -------------------- | ----------------------------------------- | ----------------------------------------- |
| 長さ                 | 可変 (しばしば長大)                       | 8 文字 (short) / 16 文字 (full)           |
| DOM 構造変化への耐性 | 低い (親要素の追加・削除で壊れる)         | 高い (テキストベースのため構造変化に強い) |
| 難読化サイト         | class 名が `aeJ` 等になり使い物にならない | 影響なし                                  |
| 人間の可読性         | 長いセレクタは読みにくい                  | 8 文字のため扱いやすい                    |
| 一意性               | 正確に 1 要素を指す                       | 衝突の可能性あり (実用上は稀)             |
| 動的コンテンツ       | 属性値変化で壊れうる                      | テキスト変化がなければ安定                |
| 取得方法             | DevTools / 手動記述                       | Text API が自動付与                       |

---

## ハッシュ計算アルゴリズム

fingerprint は以下の入力からハッシュを計算する:

1. **タグ名** — 要素の HTML タグ (`div`, `a`, `button` など)
2. **テキストコンテンツ** — 先頭 N 文字のテキスト (子要素のテキストを含む)
3. **親パス** — ルートから対象要素までのタグ名チェーン
4. **子要素数** — 直接の子要素の数
5. **属性名** — 要素が持つ属性の名前リスト (`href`, `class`, `role` など。値は含まない)

テキストコンテンツが支配的な入力であるため、同じテキストを持つ要素は同じ fingerprint を生成する。これが「テキスト同一なら fp 再現 100%」の根拠である。

---

## ライフサイクル

fingerprint を使った典型的な操作フロー:

```
1. GET /text (or POST /text)
   ↓
   レスポンスに <!--fp:a1b2c3d4--> が含まれる

2. fp を読み取る
   ↓
   "a1b2c3d4" を抽出

3. GET /resolveFingerprint?fingerprint=a1b2c3d4
   ↓
   { "selector": "div.nav > a:nth-child(2)" } で確認 (任意)

4. POST /click { "fingerprint": "a1b2c3d4" }
   ↓
   対象要素がクリックされる
```

ステップ 3 は省略可能。fingerprint を直接操作エンドポイントに渡せば内部で解決される。

---

## 安定性テスト結果 (Gmail)

Gmail でページリロード後に fingerprint が同じ要素に解決されるかを検証した結果:

| 対象                       | 一致数 | 総数 | 安定率    |
| -------------------------- | ------ | ---- | --------- |
| メール行の fingerprint     | 48     | 48   | **100%**  |
| UI 要素 (ボタン・リンク等) | 100    | 124  | **80.6%** |

- メールの fingerprint はテキストコンテンツ (件名・送信者) が変わらない限り完全に再現される。
- UI 要素の不一致はカウンタ表示 (「Inbox (3)」→「Inbox (5)」) や動的ラベルが原因。
- タイムスタンプやバッジ数を含む要素は安定しない。

---

## Short (8 文字) vs Full (16 文字)

| 種類  | 長さ    | 衝突確率                  | 用途                            |
| ----- | ------- | ------------------------- | ------------------------------- |
| Short | 8 文字  | ~1/4億 (実用上無視できる) | 通常の操作・AI エージェント向け |
| Full  | 16 文字 | 事実上ゼロ                | 大規模ページでの厳密な要素特定  |

デフォルトは short (8 文字)。Text API の出力に埋め込まれるのも short。full は `resolveFingerprint` 等の内部処理で使われる。

---

## Fingerprint が付与される要素

Text API が fingerprint を埋め込むのは以下の条件を満たす要素のみ:

- **ブロック要素**であること (`div`, `p`, `li`, `tr`, `h1`-`h6`, `button`, `a` など)
- **テキストコンテンツが空でない**こと
- **テーブルセル (`td`, `th`) の内部ではない**こと (親の `tr` に付与される)

インライン要素 (`span`, `em`, `strong`) には付与されない。これは出力の可読性を保つための設計判断。

---

## Selector Map

`includeSelectorMap=true` を指定すると、レスポンス末尾に fingerprint → CSS セレクタの対応表が付与される。

### リクエスト

```http
POST /text
Content-Type: application/json

{
  "enableFingerprints": true,
  "includeSelectorMap": true
}
```

### レスポンスの末尾に追加される対応表

```json
{
  "selectorMap": {
    "a1b2c3d4": "div.T-I.T-I-KE",
    "e5f6g7h8": "tr.zA.zE:nth-child(1)",
    "i9j0k1l2": "div.aim > div.aDP"
  }
}
```

この対応表は fingerprint のデバッグや、CSS セレクタが必要な外部ツールとの連携に使う。

---

## 全対応エンドポイント

`fingerprint` パラメータを受け付ける全エンドポイントの一覧。

### 操作系

- `/instances/:id/click`, `/doubleClick`, `/rightClick`
- `/instances/:id/hover`, `/scrollTo`, `/focus`
- `/instances/:id/fillForm`, `/selectOption`, `/setChecked`, `/clearInput`, `/submit`
- `/instances/:id/dragAndDrop`
- `/instances/:id/input`, `/pressKey`, `/uploadFile`
- `/instances/:id/setInnerHTML`, `/setTextContent`, `/dispatchTextInput`
- `/instances/:id/dispatchEvent`
- `/instances/:id/waitForElement`

### 取得系

- `/instances/:id/element`, `/elements`, `/elementText`, `/elementTextContent`
- `/instances/:id/isVisible`, `/isEnabled`
- `/instances/:id/attribute`, `/value`
- `/instances/:id/elementScreenshot`
- `/instances/:id/resolveFingerprint`
