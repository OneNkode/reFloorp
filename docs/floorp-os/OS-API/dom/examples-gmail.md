# Gmail 出力例

OS API の各エンドポイントが Gmail に対してどのようなレスポンスを返すかの実例集。

> 注: テスト用アカウントのデータを使用しています。

---

## API 応答時間サマリー

| API         | 応答時間 | サイズ |
| ----------- | -------- | ------ |
| text (full) | 1.86 s   | 124 KB |
| ax-tree     | 0.27 s   | 134 KB |
| html (full) | 1.33 s   | 787 KB |
| article     | 0.36 s   | 65 KB  |
| screenshot  | 0.17 s   | 396 KB |

---

## 1. Text 出力

`POST /text { "mode": "full", "enableFingerprints": true }` の出力例 (抜粋)。

```markdown
# Gmail <!--fp:9f2e4a71-->

[Gmail](https://mail.google.com/) <!--fp:b3c8d102-->

**Search mail** <!--fp:e7a1f5b9-->

## Labels <!--fp:1d4c6e83-->

- [Inbox (3)](https://mail.google.com/mail/u/0/#inbox) <!--fp:a2b5c8d1-->
- [Starred](https://mail.google.com/mail/u/0/#starred) <!--fp:f4e7d0a3-->
- [Snoozed](https://mail.google.com/mail/u/0/#snoozed) <!--fp:c6b9a2e5-->
- [Sent](https://mail.google.com/mail/u/0/#sent) <!--fp:d8c1b4f7-->
- [Drafts (1)](https://mail.google.com/mail/u/0/#drafts) <!--fp:e0d3c6a9-->
- [More](<javascript:void(0)>) <!--fp:2f5e8b1d-->

## Inbox <!--fp:7a0d3f6c-->

|     | From                                 | Subject                                                        | Date   |
| --- | ------------------------------------ | -------------------------------------------------------------- | ------ |
| ☆   | Alice Johnson <!--fp:4b7e0a3d-->     | Meeting tomorrow at 10am - Hi, just confirming our meeting...  | Mar 24 |
| ☆   | Bob Smith <!--fp:8c1d4f7a-->         | Project update Q1 report - Please find attached the Q1...      | Mar 24 |
| ☆   | GitHub <!--fp:d3f6c9b2-->            | [floorp-browser/floorp] Pull request #1234: feat(os-api)...    | Mar 23 |
| ☆   | Newsletter <!--fp:6e9b2d5f-->        | Weekly digest: Top stories in tech - This week's highlights... | Mar 23 |
| ☆   | Carol Davis <!--fp:0a3d6f9c-->       | Re: Design review feedback - Thanks for the comments, I...     | Mar 22 |
| ☆   | AWS Notifications <!--fp:5c8b1e4a--> | Your invoice for March 2026 is available - Account: 1234...    | Mar 22 |

---

1 - 50 of 127 <!--fp:3e6a9d2c-->
```

### Fingerprint 統計

| カテゴリ           | 付与数 | 説明                 |
| ------------------ | ------ | -------------------- |
| ナビゲーション要素 | 12     | ラベル、メニュー項目 |
| メール行           | 48     | 送信者名に付与       |
| UI コントロール    | 24     | ボタン、リンク       |
| セクション見出し   | 8      | `## Inbox` 等        |
| **合計**           | **92** |                      |

### Fingerprint を使ったクリック例

Text 出力から Bob Smith のメールを開く:

```http
POST /click
Content-Type: application/json

{
  "fingerprint": "8c1d4f7a"
}
```

レスポンス:

```json
{
  "ok": true
}
```

---

## 2. ax-tree 出力

`GET /ax-tree` の出力例 (抜粋)。`interestingOnly=true` (デフォルト) により装飾ノードは省略される。

```json
{
  "tree": {
    "role": "WebArea",
    "name": "Inbox (3) - user@gmail.com - Gmail",
    "children": [
      {
        "role": "banner",
        "name": "",
        "children": [
          { "role": "button", "name": "Main menu" },
          { "role": "link", "name": "Gmail" },
          {
            "role": "search",
            "name": "Search mail",
            "children": [
              { "role": "textbox", "name": "Search mail" },
              { "role": "button", "name": "Search options" }
            ]
          },
          { "role": "button", "name": "Support" },
          { "role": "button", "name": "Settings" },
          {
            "role": "button",
            "name": "Google Account: Test User (user@gmail.com)"
          }
        ]
      },
      {
        "role": "navigation",
        "name": "",
        "children": [
          { "role": "button", "name": "Compose" },
          {
            "role": "tree",
            "name": "Labels",
            "children": [
              { "role": "treeitem", "name": "Inbox 3", "selected": true },
              { "role": "treeitem", "name": "Starred" },
              { "role": "treeitem", "name": "Snoozed" },
              { "role": "treeitem", "name": "Sent" },
              { "role": "treeitem", "name": "Drafts 1" }
            ]
          }
        ]
      },
      {
        "role": "tablist",
        "name": "",
        "children": [
          { "role": "tab", "name": "Primary", "selected": true },
          { "role": "tab", "name": "Promotions", "selected": false },
          { "role": "tab", "name": "Social", "selected": false }
        ]
      },
      {
        "role": "table",
        "name": "",
        "children": [
          {
            "role": "row",
            "name": "",
            "children": [
              { "role": "checkbox", "name": "Select", "checked": false },
              { "role": "button", "name": "Star" },
              { "role": "cell", "name": "Alice Johnson" },
              { "role": "cell", "name": "Meeting tomorrow at 10am" },
              { "role": "cell", "name": "Mar 24" }
            ]
          },
          {
            "role": "row",
            "name": "",
            "children": [
              { "role": "checkbox", "name": "Select", "checked": false },
              { "role": "button", "name": "Star" },
              { "role": "cell", "name": "Bob Smith" },
              { "role": "cell", "name": "Project update Q1 report" },
              { "role": "cell", "name": "Mar 24" }
            ]
          }
        ]
      }
    ]
  }
}
```

### ax-tree から読み取れる情報

| 情報             | 確認方法                                                |
| ---------------- | ------------------------------------------------------- |
| ページのタイトル | `WebArea.name` → `"Inbox (3) - user@gmail.com - Gmail"` |
| 未読メール数     | `treeitem[name="Inbox 3"]` → 3 通                       |
| 現在のタブ       | `tab[selected=true]` → `"Primary"`                      |
| メールの送信者   | `row > cell[0].name` → `"Alice Johnson"`                |
| メールの件名     | `row > cell[1].name` → `"Meeting tomorrow at 10am"`     |
| 操作可能なボタン | `role: "button"` を列挙 → Compose, Settings, Star, ...  |
| 検索ボックス     | `role: "textbox", name: "Search mail"`                  |
| チェック状態     | `checkbox.checked` → `false` (未選択)                   |
| ラベル一覧       | `tree[name="Labels"] > treeitem` を列挙                 |

ax-tree は Gmail のような大規模 SPA でも 0.27 s / 134 KB で構造全体を把握できる。操作対象の特定には Text よりも先に ax-tree を使うことを推奨する。

---

## 3. HTML 出力

`GET /html` の出力例 (大幅に省略)。

```html
<html lang="en" class="aAo">
  <head>
    <meta charset="utf-8" />
    <title>Inbox (3) - user@gmail.com - Gmail</title>
    <style>
      .aeJ {
        display: flex;
      }
      .bkK {
        margin: 0 8px;
      }
      .T-I {
        border-radius: 24px;
        cursor: pointer;
      }
      /* ... 数千行のインラインスタイル ... */
    </style>
  </head>
  <body class="aAo aAU" jscontroller="PxGbkd">
    <div class="aeN">
      <div class="ajl aib aZ6">
        <div class="T-I T-I-KE L3" role="button" gh="cm">
          <div class="aic">
            <div class="z0">
              <div class="T-I-J3 J-J5-Ji">Compose</div>
            </div>
          </div>
        </div>
      </div>
      <div class="wT">
        <div class="n3">
          <div class="aim">
            <div class="aDP">
              <div class="bsU">
                <a href="#inbox" class="J-Ke n0 aHS-bnt" data-tooltip="Inbox">
                  <div class="aio aip">Inbox</div>
                  <div class="bsU">3</div>
                </a>
              </div>
              <!-- ... -->
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="aeF">
      <div class="Cp">
        <table class="F cf zt">
          <tbody>
            <tr class="zA zE" id=":3r">
              <td class="oZ-x3 xY">
                <div class="oZ-jc T-Jo J-J5-Ji" role="checkbox"></div>
              </td>
              <td class="WA xY"><span class="yP">Alice Johnson</span></td>
              <td class="xY">
                <div class="xS">
                  <div class="xT">
                    <span class="bqe">Meeting tomorrow at 10am</span
                    ><span class="y2">
                      - Hi, just confirming our meeting...</span
                    >
                  </div>
                </div>
              </td>
              <td class="xW xY"><span>Mar 24</span></td>
            </tr>
            <!-- ... 以降のメール行 ... -->
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>
```

### HTML が非推奨である理由

| 問題点           | 説明                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| サイズ           | 787 KB。Text (124 KB) の 6 倍以上                                      |
| 応答時間         | 1.33 s。ax-tree (0.27 s) の 5 倍                                       |
| class 名の難読化 | `aeJ`, `bkK`, `T-I-KE` のように意味不明。CSS セレクタの構築が困難      |
| 構造の深さ       | Compose ボタンだけで 5 段の `div` ネスト。手動解析に不向き             |
| 頻繁な変更       | Google が class 名を定期的に変更するため、作成したセレクタが壊れやすい |

HTML は生の DOM 構造が必要な特殊ケース (カスタム属性の確認、スタイル解析など) にのみ使用し、通常のページ操作では ax-tree と Text を使うこと。
