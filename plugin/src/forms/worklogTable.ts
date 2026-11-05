import type { YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import { isIsoDate, parseHours } from '../parse/values';
import { tableCell, type TableEdit } from '../write/markdownTable';
import { isReadable, link } from './formValues';
import { isChanged, linkCell, readRows, type TableEditResult, type TableRows } from './tableRows';

/** 作業ログの表の編集画面の値（設計書 4.7） */

export interface WorklogRow {
	/** 元の行番号。新しい行は無し */
	line?: number;
	date: string;
	/** タスクの ID。読めない値は元の文字列のまま */
	task: string;
	planned: string;
	actual: string;
	memo: string;
}

export function worklogRows(content: string): TableRows<WorklogRow> {
	return readRows(content, TABLE_SPEC.worklog, (get, line) => ({
		line,
		date: get('date'),
		task: link(get('task'), 'task'),
		planned: get('planned'),
		actual: get('actual'),
		memo: get('memo'),
	}));
}

/**
 * 作業ログの編集を確かめ、表の書き換えにする。日付は対象月の中だけ。
 * 同じ日付・タスクの行は集計で合算されるので知らせる（設計書 4.7）
 */
export function worklogEdits(
	rows: readonly WorklogRow[],
	initial: readonly WorklogRow[],
	month: YearMonth,
	title: (id: string) => string,
): TableEditResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const edits: TableEdit[] = [];
	const seen = new Set<string>();
	rows.forEach((row, i) => {
		const date = row.date.trim();
		const planned = row.planned.trim();
		const actual = row.actual.trim();
		const memo = row.memo.trim();
		if (row.line === undefined && date === '' && row.task === '' && planned === '' && actual === '' && memo === '') return;
		const at = `作業ログ ${i + 1}行目`;
		const changed = isChanged(row, initial, ['date', 'task', 'planned', 'actual', 'memo']);
		if (!isIsoDate(date)) errors.push(`${at}：日付を選んでください`);
		else if (!date.startsWith(`${month}-`)) errors.push(`${at}：日付は ${month} の日にしてください（ほかの月の記録は、この行を消して「作業ログを入力」で入れ直します）`);
		if (row.task === '') errors.push(`${at}：タスクを選んでください`);
		else if (!isReadable(row.task, 'task')) warnings.push(`${at}：タスクの読めない値（${row.task}）はそのまま残しました`);
		if (planned !== '' && parseHours(planned) === null) errors.push(`${at}：予定は0以上で0.25刻みの数値で入力してください（例：1.5）`);
		if (actual !== '' && parseHours(actual) === null) errors.push(`${at}：実績は0以上で0.25刻みの数値で入力してください（例：1.5）`);
		// 変えていない行は、予定・実績が空でもそのまま残す
		if (changed && planned === '' && actual === '') errors.push(`${at}：予定か実績のどちらかを入力してください`);
		const key = `${date} ${row.task}`;
		if (row.task !== '' && seen.has(key)) warnings.push(`${at}：同じ日付・タスクの行がほかにもあります（合計されます）`);
		seen.add(key);
		const hours = (v: string) => (v === '' ? '' : String(parseHours(v) ?? v));
		edits.push({
			...(row.line !== undefined ? { line: row.line } : {}),
			changed,
			cells: { date, task: linkCell(row.task, 'task', title), planned: hours(planned), actual: hours(actual), memo: tableCell(memo) },
		});
	});
	return { errors, warnings, edits };
}
