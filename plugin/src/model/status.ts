/** ステータスの分類。集計はステータス名ではなく必ず分類で行う */
export type StatusCategory = 'not_started' | 'in_progress' | 'done' | 'stopped';

export const STATUS_CATEGORIES: readonly StatusCategory[] = ['not_started', 'in_progress', 'done', 'stopped'];

export interface StatusDef {
	name: string;
	category: StatusCategory;
	/** 以前の名前（設計書 5.4） */
	aliases: string[];
}

/** `statuses.json` の内容。並び順が表示順で、先頭が新規作成時の初期値 */
export interface StatusSets {
	/** タスク・エピック用 */
	task: StatusDef[];
	project: StatusDef[];
}
