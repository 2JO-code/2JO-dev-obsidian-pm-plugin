# 使用ライブラリ一覧

このプラグインが使うライブラリ（外部のプログラム部品）の一覧と、ライセンスの確かめ。

- ライブラリを足す・外す・版を上げたときは、この文書も直す
- 確認日：2026-11-04（`plugin/package.json`、`plugin/node_modules`、`plugin/src` の import から調べた）

## 1. 要点

- **利用者の手元で動く `main.js` には、外部ライブラリを1つも入れていない**
  - `package.json` の `dependencies`（実行時に使うもの）は空。すべて `devDependencies`（開発だけ）
- 実行時に使うのは、Obsidian 本体の `obsidian` API と、Node.js・ブラウザの標準機能だけ
- グラフ・ガント（SVG で自前描画）と UUID v7（設計書 10章）も、ライブラリを増やさないため自前で書いた
- ライセンスはすべて MIT か Apache-2.0（どちらも商用利用・改変が自由）

## 2. 実行時に使うもの（main.js から呼ぶ）

`main.js` には入れず（esbuild の `external`）、Obsidian が動いているときに本体側のものを使う。

| 名前 | 何か | どこで使うか |
| --- | --- | --- |
| `obsidian` | Obsidian のプラグイン API | つなぎと画面の層（設計書 1.1）。パッケージは型定義だけで、中身は本体にある |
| `fs`・`path`（Node.js 標準） | ファイルの書き出し・パスの組み立て | `commands/htmlReport.ts`（設計書 13章）。デスクトップ版だけで使えるため `isDesktopOnly: true` |
| `crypto.getRandomValues`（ブラウザ標準） | 乱数 | `id/uuid7.ts` |

## 3. 開発のときだけ使うもの（devDependencies）

指定は `package.json` の範囲、実際の版は `node_modules` の中。`^` は「その版以上で、いちばん左の数字が同じもの」。

| 名前 | 指定 | 実際の版 | ライセンス | 何のためか |
| --- | --- | --- | --- | --- |
| `obsidian` | `latest` | 1.12.3 | MIT | Obsidian API の型定義。型チェックと入力補完 |
| `typescript` | `^5.8.3` | 5.9.3 | Apache-2.0 | `npm run build` で型チェック（`tsc -noEmit`） |
| `esbuild` | `0.25.5` | 0.25.5 | MIT | `src/main.ts` から `main.js` を作る（バンドル）。`esbuild.config.mjs` |
| `@types/node` | `^22.15.17` | 22.19.17 | MIT | Node.js 標準機能（`fs`・`path`）の型定義 |
| `vitest` | `^4.1.12` | 4.1.12 | MIT | テスト（`npm test`） |
| `vite` | `^7.3.7` | 7.3.7 | MIT | vitest が中で使う |
| `eslint` | `^9.39.4` | 9.39.4 | MIT | 書き方の検査（`npm run lint`）。`eslint.config.mts` |
| `eslint-plugin-obsidianmd` | `^0.4.0` | 0.4.0 | MIT | Obsidian 公式の検査ルール |
| `typescript-eslint` | `^8.59.1` | 8.59.2 | MIT | eslint で TypeScript を読む。上が必要とする |
| `@eslint/js` | `^9.39.4` | 9.39.4 | MIT | eslint の基本ルール。上が必要とする |
| `globals` | `^17.6.0` | 17.6.0 | MIT | `window`・`document` などの名前を eslint に教える |
| `jiti` | `^2.6.1` | 2.7.0 | MIT | eslint が TS の設定ファイルを読むために使う |

- この表に無いもの（`node_modules` のほかのフォルダ）は、上のライブラリが中で使うもの
- 全部の版は `package-lock.json` に記録されている

## 4. 補助スクリプト

次のスクリプトは、Node.js 標準（`fs`・`path`・`url`）だけで書いている。

- `scripts/deploy.mjs`（開発用 Vault へのコピー）
- `scripts/readme-text.mjs`（README を TS に変換）
- `scripts/generate-dummy.mjs`（ダミーデータ）
- `plugin` 直下の `version-bump.mjs`（公式サンプル由来。版の番号を上げる）
- 詳しくは設計書 12章

## 5. 気をつけること

- `obsidian` だけ版を `latest`（いつも最新）にしている（公式サンプルのまま）
  - `npm install` し直すと型定義の版が変わり、型チェックの結果が変わることがある。困ったら版を固定する
- `dependencies` に足すと `main.js` が大きくなり、利用者の手元で動くコードが増える
  - 自前で書けないか先に考える。足すときは事前にユーザーに確認する（CLAUDE.md）
- 開発に使う Node.js：確認時は v26.13.0

## 6. ライセンス表記の確認（2026-11-04）

MIT・Apache-2.0 は、コピーを配るときに著作権表示とライセンス文を付ける決まりがある。
配るものにライブラリが入っているかで、表記が要るかが決まる。

| 配るもの | 他者のコード | 表記が要るか |
| --- | --- | --- |
| `main.js`・`manifest.json`・`styles.css`（Vault に置いて全員に配る） | 入っていない（`main.js` に他者の著作権表示は0件） | 要らない |
| HTML レポート | 入っていない（グラフも自前の SVG） | 要らない |
| 開発用のライブラリ（3章） | 配らない（開発者の手元だけ） | 要らない |

- 自分たちのコードの表記は、公式サンプルの文のまま（ユーザー判断）
  - `plugin/LICENSE` は 0-BSD（著作権者 Dynalist Inc.）、`package.json` の `license` も `0-BSD`
  - `manifest.json` の `author` は空
- 自作のコードに他者のコード片が紛れていないかも確かめた
  - `src`・`scripts`・`styles.css` に、ライセンス文・著作権表示・出典の URL・「〜から移植」は無い
  - よく知られた処理は、考え方や仕様に沿って自分で書いたもの
  - 例：循環の検出、UUID v7、目盛りのきりのよい値、HTML の置き換え、表の読み取り
  - 設定・ビルドのファイル（`esbuild.config.mjs`・`version-bump.mjs` など）は公式サンプル由来の 0-BSD
- ライブラリを `main.js` に入れることになったら、そのライセンス文を配布物に添える
  - 例：`main.js` の先頭に残す、`THIRD_PARTY_LICENSES.md` を Vault に置く

## 7. ScanCode による検査

コードにライセンス文・著作権表示・既知のコード片が入っていないかを機械的に調べるツール。
プラグインには入れず、開発者の手元だけで使う。

- 場所：リポジトリ直下の `.tools/scancode-venv`（Python の仮想環境）
  - `.gitignore` に `.tools/` と、検査結果の `scan.json` を書いている
- 版：ScanCode Toolkit 32.5.0（Apache-2.0）、Python 3.14（3.15 には ScanCode がまだ対応していない）
  - `pluggy` は 1.5.0 に固定（1.6 以降だと ScanCode が起動しない）
- 大きさ：約600MB。要らなくなったら `.tools` フォルダを消す（Python 3.14 は `py uninstall 3.14`）

使い方（`plugin` で実行。結果はリポジトリの外に出す。数分かかる）：

```powershell
cd plugin
..\.tools\scancode-venv\Scripts\scancode.exe --license --copyright --info -n 4 --json-pp <出力先>\scan.json --ignore node_modules --ignore main.js --ignore package-lock.json --ignore generated .
```

- 除外は `--ignore` で指定する（`--include "src/*"` だと `node_modules` の中の `src` まで拾う）
- 結果の `detected_license_expression_spdx` が空でないファイル、`copyrights` があるファイルを確かめる
- 「Some characters could not be decoded」は日本語を読み替えた知らせ。見落としにはつながりにくい

検査の結果（2026-11-04）：

- `plugin` の 194 ファイルを検査し、エラーは0件
- 見つかったのは `plugin/LICENSE`（0BSD、公式サンプル由来）だけ。自作のコードからは何も無い
