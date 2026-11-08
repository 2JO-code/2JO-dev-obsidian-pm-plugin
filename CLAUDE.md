# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Obsidian 上で、複数プロジェクト横断の進捗・メンバー負荷を可視化するプラグイン（TypeScript）。

- 仕様の正本は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。実装・設計判断の前に該当章を読む
- 未決事項は要件 8章。勝手に確定させず、ユーザーに確認する
- **再開するときは、まず [docs/progress/TASKS.md](docs/progress/TASKS.md) で現在地（`[~]` と次の `[ ]`）を確かめる**

## 文書の役割

1つのことは1つの文書にだけ書き、ほかからは「設計書 4.1」のように節番号で参照する。

| 文書 | 書くこと | 書かないこと |
| --- | --- | --- |
| [REQUIREMENTS.md](docs/REQUIREMENTS.md) | 何を作るか（今の仕様） | 作り方、理由、変更の経緯 |
| [DESIGN.md](docs/DESIGN.md) | 今の作りと、そうした理由 | 変更の経緯（いつ・だれの要望か） |
| [DIAGRAMS.md](docs/DIAGRAMS.md) | 今の作りの図（クラス図・シーケンス図、Mermaid） | 理由・細かい決まり（設計書へ） |
| [TASKS.md](docs/progress/TASKS.md) | 作業中・未着手のタスク、持ち越し課題 | 終わったタスク |
| [HISTORY.md](docs/progress/HISTORY.md) | 終わったタスクの結果、仕様の移り変わり | 今の仕様・作りの説明 |
| [CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) | このプロジェクト独自のコードの書き方 | Obsidian API の公式の決まり |
| [OBSIDIAN_BEST_PRACTICES.md](docs/OBSIDIAN_BEST_PRACTICES.md) | Obsidian API の使い方（公式と適用方針） | 独自の書き方 |
| [UI_STYLE_GUIDE.md](docs/UI_STYLE_GUIDE.md) | 見た目の書き方（色・余白・印・リンク・表） | 決めた理由（設計書へ） |
| [LIBRARIES.md](docs/LIBRARIES.md) | 使うライブラリ（版・ライセンス・用途） | — |
| [docs/vault/README.md](docs/vault/README.md) | 利用者向けの使い方 | 開発者向けの話 |

- コードを書く前に規約、CSS を書く前に UI_STYLE_GUIDE を読む
- 実装を変えたら設計書を、画面や操作を変えたら README を、ライブラリを変えたら LIBRARIES を直す
- クラスや処理の流れを変えたら DIAGRAMS も直す
- 文書の節番号はコードから参照されているので変えない。節を足すときは末尾に足す

### 文書の書き方

- 端的に書く。前置き・言い換え・繰り返しは書かない
- **1行は全角60字（半角120字）まで**。表の行・コード・URL は除く
- 長い文は折り返さず、文を分けて箇条書きにする（行の途中で改行しない）
- 理由は「〜のため」と1文で添える。経緯（以前は〜、ユーザー要望で〜）は HISTORY.md に書く
- コードのコメントは「何をするか」を1行。理由は設計書に書いて節番号で参照する（規約 1章）

## 開発の進め方

### ユーザーとのやりとり

- 日本語で、エンジニア初学者にも分かる言葉で説明する（専門用語は言い換えるか一言添える）
- **重要な実行の前は、何をするか・影響・元に戻せるかを日本語で説明して確認を取る**
  - インストール、ファイルの大量作成・削除、設定やビルド構成の変更など
  - ダミーデータの作成は Obsidian を閉じてもらってから
- 仕様の判断が要るときは選択肢で聞く（推奨を先頭に、理由つき）
  - 決まったことは REQUIREMENTS.md に、日付と経緯は HISTORY.md に書く
- 報告は「何をしたか → 決めたこと → 確認方法」の順に書く
  - 確認方法は、番号つきの手順と、正しく動いたときの見え方

### 1つのタスクの流れ

1. TASKS.md にタスクを書き、`[~]` にする（大きいものは細かい作業に分ける）
2. Obsidian に依存しない処理（判定・変換・計算）を書き、テストを書く
3. Obsidian とつなぐ部分・画面を書く（規約とベストプラクティスに従う）
4. `npm run build`・`npm run lint`・`npm test` を通し、`npm run deploy` で開発用Vaultに反映する
5. ユーザーに Obsidian 上での確認を頼む
   - 開発用Vaultのファイルを読んで確かめられるときは自分でも確かめる
6. 結果を TASKS.md に書いて `[x]` にし、数行に縮めて HISTORY.md へ移す。理由や設計は DESIGN.md に書く

### 不具合や要望が出たとき

- 不具合
  - 症状を聞く。必要なら開発者ツール（Ctrl+Shift+I → Console）の赤い文を貼ってもらう
  - 原因を説明して直し、再現するテストを足す。TASKS.md に「不具合修正（日付）」として書く
  - 再発防止の決まりは、規約かベストプラクティスに足す
- 要望による変更：TASKS.md に「改善（日付、ユーザー要望）」「仕様変更」として書く
  - 要件・設計書も合わせる
- 文書どうし・文書とコードの食い違いに気づいたら、まとめて報告してから直す
- すぐに対応しない課題は、TASKS.md の「持ち越し課題」に書く

## リポジトリの状態

- フォルダ構成
  - `docs/`：上の文書。`docs/vault/README.md` は Vault の直下に置く利用者向けの使い方の正本
  - `docs/progress/`：日々変わる TASKS.md・HISTORY.md。Git に入れない（手元だけ）
    - ビルドで `plugin/src/generated/readmeText.ts` に変換され、「使い方を開く」で Vault に書き出す（設計書 9章）
  - `plugin/`：プラグインのソースとビルド設定（公式 `obsidian-sample-plugin` ベース）。npm 関連はすべてここ
  - ルート：CLAUDE.md（ルートにないと読み込まれない）、`.claude/`、`.gitignore`
  - `.tools/`：開発者の手元だけで使う検査ツール（Git に入れない。LIBRARIES.md 7章）
- 段階1〜4はすべて実装済み。そのあとの改善と進み具合は TASKS.md・HISTORY.md
- **ソースは Git で管理し、GitHub（公開）に置く**
  - https://github.com/2JO-code/2JO-dev-obsidian-pm-plugin （ブランチ `main`）
  - コミット・push はユーザーが Git Bash で行う。こちらは手順だけ示す
  - 文書に出てくる SVN は、すべて**本番Vaultの共有**の話（要件 2章）で、ソースの管理とは別
- このリポジトリに Vault は含めない（要件 7.1）
  - 開発用Vault：同じ階層の `D:\project\dev-projectmanager-plugin-vault`（環境変数 `OBSIDIAN_VAULT` で変更可）
  - 本番Vaultでは開発しない
- プラグインID は `project-manager`（リリース後は変えない）。`isDesktopOnly: true`
- `.claude/settings.local.json` で、ファイルの読み取りをこのリポジトリと開発用Vaultだけに制限している

## コマンド（`plugin/` で実行）

```bash
npm install
npm run dev      # esbuild watch。ビルド成功のたびに開発用Vaultへ自動コピー（scripts/deploy.mjs）
npm run build    # README を TS に変換（npm run readme）し、tsc -noEmit で型チェック後、本番ビルド（minify）
npm run deploy   # 本番ビルドして開発用Vaultへコピー
npm run package  # 本番ビルドして配布用の release/project-manager-<版>.zip を作る（設計書 12章）
npm version 0.3.0 --no-git-tag-version   # 版を上げる（manifest.json・versions.json も更新）
npm run lint     # eslint + eslint-plugin-obsidianmd
npm test         # Vitest で src/**/*.test.ts を1回実行
npm run test:watch                    # 変更を監視して再実行
npx vitest run src/calc/foo.test.ts -t "テスト名"   # 1ファイル・1テストだけ実行
npm run dummy        # 開発用Vaultにダミーデータ（約3,800件、dummy: true 付き）を作り直す（`-- --today YYYY-MM-DD` で基準日）
npm run dummy:clean  # ダミーデータだけを消す
```

- ダミーデータを作る・消すのは開発用Vaultのファイルを大量に変える操作。実行前にユーザーに確認する
  - Obsidian を閉じてから実行するのがよい
- テスト対象のコードは `obsidian` を import しない（型定義だけで、テスト実行時には中身がない）
- tsconfig は `strict` + `noUncheckedIndexedAccess`
- `obsidian`・`electron`・`@codemirror/*` 等は external。それ以外の依存は `main.js` にバンドルされる

## アーキテクチャ

詳細は [docs/DESIGN.md](docs/DESIGN.md)（1章に全体構成とフォルダの役割）。要点：

- **純粋関数と Obsidian 部分を分ける**
  - 判定・変換・文字列の組み立ては Obsidian に依存しないファイルに置いてテストを書く
  - Obsidian API を呼ぶのは薄い層だけ
  - `store/vaultStore.ts`・`config/sharedConfig.ts`・`write/frontmatterFile.ts`・`commands/`・`ui/`・`views/`
- **データの流れ**：`VaultStore` が起動完了後に全ノートを読んで `VaultIndex` を作る
  - 変更を差分更新し、`updated` イベントでビューに知らせる。計算（`calc/`）は表示のたびに行う
- **ビュー**：すべてカスタムビューとして自作（Obsidian Bases は使わない）
- **利用者にノートを直接編集させない**（要件 4.2、設計書 4.9）
  - 値の変更はすべてプラグインの画面で行う。使い方では直接編集を案内しない
  - 新しい項目を足すときは、それを変える画面も用意する

## データモデルの要点（間違えやすい点）

- 1件1Markdown。ファイル名＝ID＝`接頭辞-UUIDv7`（`PJT`/`EPIC`/`TASK`/`USER`）
  - 作業ログだけ `USER-UUID_YYYY-MM`。作るときに Vault 内の重複を確かめる
- フォルダ・ファイル名に意味を持たせない。所属やタイトルはプロパティで持つ
  - `title` と同じ値を `aliases` に入れ、タイトルを変えたら両方を書き換える
- リンク型プロパティは `[[接頭辞-UUID]]` 形式。プロパティキーは英字で固定
- ステータスは `_pm/statuses.json` で定義し、集計は必ず**分類**で行う
  - 分類：`not_started`/`in_progress`/`done`/`stopped`。ステータス名をハードコードしない
  - タスク・エピック用とプロジェクト用の2セット
- 稼働日は `_pm/calendar.json`（会社休日＋土日を休日にするか）で判定する
  - 個人休日（メンバーのノートの本文の表）は一覧の印だけ。稼働日・負荷・日程の計算には入れない
- 作業ログの工数は0.25h刻み、日付は対象月内のみ、同日同タスクの行は合算

## 書き込みの原則（本番Vaultの SVN コンフリクト対策のため厳守）

- 進捗率・負荷率・依存関係から計算した日程などの**計算結果はファイルに保存しない**。表示のたびに計算する
- 依存関係による日程のずれでファイルを書き換えない（`due` は固定値）
- frontmatter は**項目順序と日付形式 `YYYY-MM-DD` を固定**し、不要な差分を出さない（設計書 4.1）
  - `processFrontMatter` を使い、コールバック内でキーを決めた順に入れ直す
  - 日付は文字列で渡し、`Date` は使わない。`wbs`・`case_id` など数字に見える値は文字列で書く
- 本番Vaultでは `.obsidian/workspace.json` 等の個人状態を `svn:ignore` 対象にする
