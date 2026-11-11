# コーディング規約

このプロジェクト独自のコードの書き方。コードを書く前に読む。

- Obsidian API の使い方（公式の決まり）は [OBSIDIAN_BEST_PRACTICES.md](OBSIDIAN_BEST_PRACTICES.md)
- 見た目（CSS）の決まりは [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md)、設計の理由は [DESIGN.md](DESIGN.md)
- 両方に書くことはしない。Obsidian の公式の決まりはベストプラクティスに書く

---

## 1. コメント

- **コードは短く、理由は設計書に**
  - 「なぜそうしたか」「調べた経緯」「他の案」は [DESIGN.md](DESIGN.md) に書く
  - コードからは節番号で参照する（例：`// 書き込み前に並べ直す（設計書 4.1）`）
- コメントは**何をするか**を1行で書く。コードを読めば分かることは書かない
- 関数・型・定数のコメントは `/** … */` で1行（長くても2〜3行）
  - 引数の説明は、名前から分からないものだけ `@param` で書く
- 単位・形式・特別な値は残す（例：`/** 予定(h)。空欄は 0 */`、`/** 0始まりの行番号 */`）
- 守らないと壊れる決まりは短く残す（例：`// 名前を open にしない（ベストプラクティス 5章）`）
- 日本語で書く。仕様の言葉（ステータス、エピック、作業ログ など）は要件定義と同じものを使う
- 消したコードをコメントで残さない

## 2. ファイルとフォルダ

- フォルダの役割は [DESIGN.md](DESIGN.md) 1.2 のとおり。新しい機能もこの分け方に合わせる
- **Obsidian に依存しない処理と、Obsidian API を呼ぶ処理を別のファイルに分ける**
  - 判定・変換・文字列の組み立ては依存しないファイルに置き、テストを書く
- 依存しないファイルは `obsidian` を import しない（型定義だけで、テストでは動かない）
  - 型だけなら `import type` でよい
- `main.ts` には起動処理、各機能の `register…(plugin)` の呼び出し、設定の読み込みと保存だけを書く
  - コマンド・メニュー・ビューなどは `register…(plugin)` 関数として各フォルダに置く
- 1ファイルは1つの役割にする
- フォルダごとの `index.ts` でまとめて export してよい（`main.ts` からはファイルを直接 import する）

## 3. 名前

| 対象 | 書き方 | 例 |
| --- | --- | --- |
| 変数・関数 | camelCase | `parseLinkId`, `taskForm` |
| クラス・型・インターフェース | PascalCase | `VaultIndex`, `TaskForm` |
| 定数（設定値・一覧） | UPPER_SNAKE_CASE | `DEFAULT_SETTINGS`, `TABLE_SPEC` |
| ファイル | camelCase.ts（クラスが主ならその名前） | `vaultStore.ts`, `taskFormModal.ts` |
| テスト | 対象と同じ名前 + `.test.ts`、同じフォルダ | `taskForm.test.ts` |
| CSS クラス | `pm-` で始める kebab-case | `pm-health-file` |
| コマンドID | kebab-case | `create-task`, `input-worklog` |

- frontmatter のキーは英字の snake_case（`depends_on`）。TypeScript の項目は camelCase（`dependsOn`）
  - 変換は読み取り（`store/buildNote.ts`）と書き込み（`forms/`）だけで行う
- 関数名は動詞から始める（`parse…`, `build…`, `find…`, `check…`, `plan…`, `open…`, `register…`）
- ビューなどで避けるメソッド名は、ベストプラクティス 5章

## 4. 型

- `strict` と `noUncheckedIndexedAccess` を前提にする
  - 配列の要素は `undefined` かもしれないものとして扱う（`list[0]?.name`、`?? ''`）
- `any` を使わない。外から来る値（frontmatter、JSON、`loadData()`）は `unknown` で受け、確かめてから使う
- `as` による型の決めつけは避ける
  - 外から来る値は確かめてから使う（例：候補の一覧と照らす `oneOf()`。`parse/values.ts`）
  - オブジェクトの中は `isRecord` で確かめ、キーの値は `field(v, 'key')` で読む（`parse/values.ts`）
  - ビューの状態（`setState`）も同じ。`isRecord` をファイルごとに書かない
  - Obsidian の `TFile` などは `instanceof` で確かめる
  - TypeScript が型を絞れないだけで値が確かなとき（`Object.keys()` の結果など）は使ってよい
- モデル（`model/` の型）の任意項目は「キーが無い」で表す
  - `undefined` を入れた項目を作らない（`optional()` などで取り除く）
  - frontmatter の変更内容（`FrontmatterUpdate`）では、`undefined` は「そのキーを消す」の意味
- 日付は `IsoDate`（`YYYY-MM-DD` 文字列）。`Date` は計算の中だけで使い、保存しない
- 型による絞り込み（`value is X`）は、本当に型が絞れるときだけ使う
  - `IsoDate` は `string` の別名なので使わない

## 5. エラーと入力チェック

- 画面に出す文言は日本語で、利用者向けの言葉で書く（エンジニア以外も使うため。要件 2章）
  - 例：「見積工数は0以上で0.25刻みの数値で入力してください」
- 入力の誤りは、純粋関数が文言の一覧（`errors: string[]`）で返すか、文言つきの `Error` を投げる
  - 画面側はそれを表示するだけにする
- 保存してよいが知らせたいことは `warnings` として分ける
- Obsidian API の失敗（ファイルの書き込みなど）は `try` / `catch` で受け、`notifyError` で知らせる（設計書 4.13）
  - `e instanceof Error ? …` を書かず、`errorMessage` を使う
  - 黙って無視しない。コンソールへの出力はベストプラクティス 8章

## 6. 非同期処理

- 書き方の基本（`async` / `await`）はベストプラクティス 8章
- 戻り値の Promise を使わない呼び出し（イベントの中など）は `void` を付ける
  - 例：`onClick(() => void this.save())`
- 連続して起きるイベント（入力・ファイルの変更）は、`debounce` やタイマーでまとめる
  - 待ち時間は定数にし、理由を設計書に書く

## 7. 画面（UI）

- 要素の作り方と安全性はベストプラクティス 6章、見た目は [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md)
- 文言は短く、操作の結果が分かるように書く（例：「書き換えて閉じる」「作業ログに追加しました」）
- 影響の大きい操作（削除、全員に影響する設定の変更）は確認画面を出す（設計書 5.5）

## 8. テスト

- 純粋関数には必ずテストを書く
  - テストの名前は「何をするか」を日本語で書く（例：`it('同じ日付・同じタスクの行があれば書き換える')`）
- 不具合を直したら、その不具合を再現するテストを足す
- テストデータのIDは `0192f3a0-1234-7abc-8def-…` のような固定の UUID v7 を使う
- Obsidian 上でしか確かめられない動き（画面・イベント）は、確認手順と結果を TASKS.md に書く
  - 終わったら結果を HISTORY.md に移す

## 9. 書式とツール

- インデントはタブ、文字列はシングルクォート、文末にセミコロン（既存のコードと `.editorconfig` に合わせる）
- コミット（Git）の前に `npm run build`・`npm run lint`・`npm test` を通す
- lint の警告を残すときは、理由をここに書く
  - 今残しているもの：「WBS番号」「WBSを開く」の大文字（略語のため）
  - `getSettingDefinitions` 未対応（型定義に無いため）
- 依存パッケージを増やすときは、理由と影響を説明してユーザーに確認する
  - 小さな処理は自前で書く（例：UUID v7）
