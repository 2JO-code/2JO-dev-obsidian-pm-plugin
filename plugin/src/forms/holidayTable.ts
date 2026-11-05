import { TABLE_SPEC } from '../parse/bodyTables';
import { isIsoDate } from '../parse/values';
import { tableCell, type TableEdit } from '../write/markdownTable';
import { isChanged, readRows, type TableEditResult, type TableRows } from './tableRows';

/** メンバーの本文の個人休日の表の編集画面の値（設計書 4.7） */

export interface HolidayRow {
	/** 元の行番号。新しい行は無し */
	line?: number;
	date: string;
	memo: string;
}

export function holidayRows(content: string): TableRows<HolidayRow> {
	return readRows(content, TABLE_SPEC.holidays, (get, line) => ({ line, date: get('date'), memo: get('memo') }));
}

/** 個人休日の編集を確かめ、表の書き換えにする。同じ日付の行は最初の行だけが使われるので知らせる（設計書 4.7） */
export function holidayEdits(rows: readonly HolidayRow[], initial: readonly HolidayRow[]): TableEditResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const edits: TableEdit[] = [];
	const seen = new Set<string>();
	rows.forEach((row, i) => {
		const date = row.date.trim();
		const memo = row.memo.trim();
		if (row.line === undefined && date === '' && memo === '') return;
		const at = `個人休日 ${i + 1}行目`;
		if (!isIsoDate(date)) errors.push(`${at}：日付を選んでください`);
		else if (seen.has(date)) warnings.push(`${at}：同じ日付の行がほかにもあります（最初の行だけ使います）`);
		seen.add(date);
		edits.push({
			...(row.line !== undefined ? { line: row.line } : {}),
			changed: isChanged(row, initial, ['date', 'memo']),
			cells: { date, memo: tableCell(memo) },
		});
	});
	return { errors, warnings, edits };
}
