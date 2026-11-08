import { TABLE_SPEC } from '../parse/bodyTables';
import { isIsoDate } from '../parse/values';
import { tableCell, type TableEdit } from '../write/markdownTable';
import { isReadable, link } from './formValues';
import { isChanged, linkCell, readRows, type TableEditResult, type TableRows } from './tableRows';

/** プロジェクトの本文の表（マイルストーン・工数配分）の編集画面の値（設計書 4.7） */

export interface MilestoneRow {
	/** 元の行番号。新しい行は無し */
	line?: number;
	name: string;
	date: string;
	/** 連動エピックの ID。読めない値は元の文字列のまま */
	epic: string;
}

export interface AllocationRow {
	line?: number;
	month: string;
	/** メンバーの ID。読めない値は元の文字列のまま */
	member: string;
	hours: string;
}

export function milestoneRows(content: string): TableRows<MilestoneRow> {
	return readRows(content, TABLE_SPEC.milestones, (get, line) => ({ line, name: get('name'), date: get('date'), epic: link(get('epic'), 'epic') }));
}

export function allocationRows(content: string): TableRows<AllocationRow> {
	return readRows(content, TABLE_SPEC.allocations, (get, line) => ({
		line,
		month: get('month'),
		member: link(get('member'), 'user'),
		hours: get('hours'),
	}));
}

/** マイルストーンの編集を確かめ、表の書き換えにする。中身の無い新しい行は捨てる（設計書 4.7） */
export function milestoneEdits(rows: readonly MilestoneRow[], initial: readonly MilestoneRow[], title: (id: string) => string): TableEditResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const edits: TableEdit[] = [];
	rows.forEach((row, i) => {
		const name = row.name.trim();
		const date = row.date.trim();
		if (row.line === undefined && name === '' && date === '' && row.epic === '') return;
		const at = `マイルストーン ${i + 1}行目`;
		if (name === '') errors.push(`${at}：名前を入力してください`);
		if (!isIsoDate(date)) errors.push(`${at}：日付を選んでください`);
		if (row.epic !== '' && !isReadable(row.epic, 'epic')) warnings.push(`${at}：連動エピックの読めない値（${row.epic}）はそのまま残しました`);
		edits.push({
			...(row.line !== undefined ? { line: row.line } : {}),
			changed: isChanged(row, initial, ['name', 'date', 'epic']),
			cells: { name: tableCell(name), date, epic: linkCell(row.epic, 'epic', title) },
		});
	});
	return { errors, warnings, edits };
}
