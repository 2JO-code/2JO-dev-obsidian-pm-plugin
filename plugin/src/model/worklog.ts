import type { IsoDate, NoteBase, NoteId, TableRow, YearMonth } from './common';

/** 作業ログ表の1行。同じ日付・タスクの行は集計時に合算する */
export interface WorklogEntry extends TableRow {
	date: IsoDate;
	task: NoteId;
	/** 予定(h)。空欄は 0 */
	planned: number;
	/** 実績(h)。空欄は 0 */
	actual: number;
	memo: string;
}

/** 作業ログ（ファイル名 `USER-UUID_YYYY-MM`）。メンバー×月で1ファイル */
export interface Worklog extends NoteBase {
	type: 'worklog';
	member: NoteId;
	month: YearMonth;
	entries: WorklogEntry[];
}
