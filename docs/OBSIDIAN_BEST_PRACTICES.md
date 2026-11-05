# Obsidian プラグイン開発のベストプラクティス

Obsidian API の使い方の決まり。公式ドキュメント（末尾の出典）の要約と、このプロジェクトでの当てはめ方。

- 【公式】：公式ドキュメントに書かれていること
- 【方針】：このプロジェクトでどう当てはめるか
- プロジェクト独自の書き方は [CODING_GUIDELINES.md](CODING_GUIDELINES.md)。同じことを両方に書かない
- 調べた日：2026-10-31

---

## 1. 起動を軽くする

- 【公式】`onload` では、コマンド・ビューの種類・Markdown 後処理の登録だけを行う
  - 重い計算やデータ読み込みはしない
- 【公式】起動時の処理は `workspace.onLayoutReady()` の中で行う（Obsidian の読み込みが終わってから呼ばれる）
- 【公式】起動時、既存の全ファイルについて vault の `create` イベントが起きる
  - `create` の監視は `onLayoutReady` の中で登録するか、`workspace.layoutReady` が false なら何もしない
- 【公式】配る `main.js` は本番ビルド（minify）にする
  - 起動時間は **設定 → 一般 → 詳細** のストップウォッチで測れる
- 【公式】前回開いていたビューは起動時に復元されるので、カスタムビューのコンストラクタを重くしない
- 【方針】索引の作成は `onLayoutReady` の後に行い、終わるまでビューには「読み込み中」を出す
  - 数千ファイルあるので、一定件数ごとに処理を区切って画面を固まらせない（設計書 3.2）

## 2. データの読み込みと変更の検知

- 【公式】frontmatter を自前で解析しない
  - MetadataCache（`metadataCache.getFileCache(file)?.frontmatter`）を使う
- 【公式】MetadataCache の `changed` は、ファイルの索引が更新されたときに呼ばれる
  - **リネームでは呼ばれない**ので、vault の `rename` も別に監視する
- 【公式】パスからファイルを探すときは、`getFiles()` を回さず `getFileByPath()` / `getAbstractFileByPath()` を使う
- 【公式】ファイル操作に Adapter API（`app.vault.adapter`）を使わず、Vault API を使う
  - キャッシュがあり、操作が順番に処理される
- 【方針】索引の更新は、frontmatter なら `changed`、削除・リネームなら vault の `delete` / `rename`
- 【方針】本文の表（作業ログ・マイルストーン・工数配分・個人休日）は `vault.cachedRead()` で読んで解析する
- 【方針】入力のたびにイベントが来るので、再解析や再集計は間引く（デバウンス）
  - 共有サーバーでは変更検知が不安定なことがあるため、手動の再読み込みも用意する

## 3. 書き込み

- 【公式】frontmatter は `FileManager.processFrontMatter()` で変える（自前で YAML を書き換えない）
- 【公式】開いていないノートの本文は `Vault.modify()` ではなく `Vault.process()` で変える
  - 読み込みと書き込みを一度に行い、途中で他の変更が入らない
- 【公式】開いて編集中のノートは `Vault.modify()` で書き換えず、Editor API を使う
  - カーソル位置や折りたたみが保たれる
- 【公式】ユーザーが入力したパスや、コードで組み立てたパスには `normalizePath()` をかける
- 【方針】frontmatter は `processFrontMatter` で項目順を入れ直して書く（設計書 4.1）
- 【方針】作業ログの行の追加は `Vault.process()` で行う
- 【方針】設定画面で入力されたフォルダのパスは `cleanFolderPath()` で整えて保存する（設計書 6章）
  - `..` など Vault の外を指すパスを拒否するため
  - ファイルのパスを組み立てて使うときに `normalizePath()` を通す

## 4. 後片付け（無効化・再読み込み時の不具合を防ぐ）

- 【公式】イベントは `registerEvent()`、コマンドは `addCommand()` で登録すると、無効化時に自動で解除される
  - それ以外に作ったもの（DOMイベント、タイマーなど）も解除する
  - `registerDomEvent()` / `registerInterval()` が使える
- 【公式】`onunload` でビューのタブ（leaf）を閉じない。更新時に Obsidian が元の位置で開き直す
- 【方針】Hot Reload で何度も読み込み直すので、二重登録やタイマーの残りがないことを開発中に確かめる

## 5. カスタムビュー

- 【公式】ビューのインスタンスをプラグインのフィールドに持たない
  - `registerView` には毎回新しいビューを返す関数を渡す
  - 開いているビューは `workspace.getLeavesOfType()` で取る
- 【公式】Obsidian 1.7.2 以降、ビューはタブが表示されるまで「仮のビュー（DeferredView）」のまま
  - `leaf.view` は `instanceof` で型を確かめてから使う
  - ビューとやり取りするときは先に `await workspace.revealLeaf(leaf)` を呼ぶ
- 【公式】アクティブなビューやエディタは `workspace.activeLeaf` ではなく次で取る
  - `getActiveViewOfType(MarkdownView)`、`workspace.activeEditor?.editor`
- 【方針】`View` / `Component` / `Modal` を継承したクラスでは、親のメソッド名を自分のメソッドに使わない
  - 例：`open`, `close`, `load`, `unload`, `onload`, `setState`, `getState`
  - 上書きすると Obsidian の処理が動かなくなる（`open` を上書きして警告一覧が真っ白になった）
- 【方針】ビューは索引（store）の更新通知を受けて描き直す
  - ビューの中に計算結果を持たず、表示のたびに `calc/` で計算する

## 6. 画面表示（UI）と安全性

- 【公式】`innerHTML` / `outerHTML` / `insertAdjacentHTML` を使わない（不正なスクリプトが動く危険がある）
  - `createEl()` / `createDiv()` / `createSpan()` / `Setting` で作り、中身を消すときは `el.empty()`
- 【公式】スタイルを直接書かず（`el.style.color = ...` など）、`styles.css` のクラスを使う
  - 色などは Obsidian の CSS 変数（`var(--text-normal)` など）を使い、テーマに合わせる
- 【公式】画面の文言は「文の先頭だけ大文字」（英語の場合）
- 【公式】設定画面の見出しは `new Setting(containerEl).setName('…').setHeading()` で作る
  - `<h1>` `<h2>` は使わない。設定が1区分だけなら見出しを付けない。見出しに「設定」という語を入れない
- 【方針】ユーザーが入力した文字（タイトル・メモなど）は、必ず `createEl` の `text` や `setText()` で出す
- 【方針】HTMLレポートでも、文字を書き出すときは必ずエスケープする（設計書 13章）

## 7. コマンド

- 【公式】既定のショートカットキーを設定しない（他のプラグインやユーザー設定とぶつかる）
- 【公式】いつでも実行できるコマンドは `callback`、条件付きなら `checkCallback`、エディタが要るなら `editorCallback`
- 【方針】コマンドIDは一度決めたら変えない（ユーザーのショートカット設定が外れるため）

## 8. コードの書き方

- 【公式】グローバルの `app`（`window.app`）を使わず、`this.app` を使う
- 【公式】コンソールへの出力はエラーだけにする（`console.error`）。デバッグ用の出力は残さない
- 【公式】`var` を使わず `const` / `let`
- 【公式】`.then()` の連鎖ではなく `async` / `await` と `try` / `catch`
- 【公式】サンプルの名前（`MyPlugin` など）は変える。ファイルが増えたらフォルダで整理する
- 【方針】`npm run lint`（eslint-plugin-obsidianmd）で上の多くを自動で確かめる。コミット前に通す

## 9. このプロジェクト固有の注意

- 動作環境は Windows のデスクトップ版だけ（`isDesktopOnly: true`）
  - 公式の「モバイルでは Node/Electron API を使わない」「正規表現の後読みを使わない」は必須ではない
  - ただし、必要がなければ Node API は使わない
- 計算処理（`calc/`）とパーサーは Obsidian に依存させず、Vitest でテストする
- 共有設定（`_pm/*.json`）は Vault API で読み書きする。Vault の外のファイルには触れない
  - 例外：HTMLレポートの書き出し（Vault の外へ。設計書 13章）

---

## 出典

- [Plugin guidelines（Obsidian Developer Docs）](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Optimize plugin load time（Obsidian Developer Docs）](https://docs.obsidian.md/plugins/guides/load-time)
- [Understanding deferred views（Obsidian Developer Docs）](https://docs.obsidian.md/plugins/guides/defer-views)
- [MetadataCache.on('changed')（Obsidian Developer Docs）](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/on('changed'))
- 参考（非公式・大規模Vaultでの性能）
  - [obsidian performance tuning](https://smithery.ai/skills/jeremylongshore/obsidian-performance-tuning)
  - [Obsidianフォーラム：大規模Vaultでの描画の停止](https://forum.obsidian.md/t/performance-280-ms-renderer-stall-every-2-seconds-in-large-vault-caused-by-getallpropertyinfos/117693)
