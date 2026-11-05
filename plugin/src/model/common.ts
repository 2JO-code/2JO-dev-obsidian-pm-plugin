/** ノートの種類（frontmatter の `type`） */
export type NoteType = 'project' | 'epic' | 'task' | 'user' | 'worklog';

/** IDの接頭辞。作業ログはメンバーIDに `_YYYY-MM` を付けるので接頭辞を持たない */
export const ID_PREFIX = {
	project: 'PJT',
	epic: 'EPIC',
	task: 'TASK',
	user: 'USER',
} as const satisfies Record<Exclude<NoteType, 'worklog'>, string>;

/** ノートのID＝拡張子を除いたファイル名（例：`TASK-0192f3a0-...`） */
export type NoteId = string;

/** `YYYY-MM-DD` 形式の日付文字列（設計書 2章） */
export type IsoDate = string;

/** `YYYY-MM` 形式の月 */
export type YearMonth = string;

/** 全ノート共通の項目 */
export interface NoteBase {
	id: NoteId;
	/** Vault内のファイルパス */
	path: string;
}

/** タイトルを持つノート（作業ログ以外）の共通項目 */
export interface TitledNote extends NoteBase {
	title: string;
	aliases: string[];
}

/** 本文の表の行。line はファイル先頭からの0始まりの行番号 */
export interface TableRow {
	line: number;
}
