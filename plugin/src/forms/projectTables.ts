import { compareJa } from '../calc/compare';
import { addMonths } from '../calc/dates';
import type { NoteId, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import { isIsoDate, isYearMonth, parseHours } from '../parse/values';
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

/** 工数配分のマス目（縦にメンバー・横に月。設計書 4.7） */
export interface AllocationMatrix {
	months: YearMonth[];
	members: NoteId[];
	/** `メンバー|月` → 配分の入力値 */
	cells: Map<string, string>;
	/** マス目に置けない行（月かメンバーが読めない）。消すことだけできる */
	others: AllocationRow[];
}

export const matrixKey = (member: NoteId, month: YearMonth) => `${member}|${month}`;

/** 開始月〜終了月（両端を含む） */
export function monthRange(start: YearMonth, end: YearMonth): YearMonth[] {
	const result: YearMonth[] = [];
	for (let m = start; m <= end; m = addMonths(m, 1)) result.push(m);
	return result;
}

/** 表の行を月・メンバーのマスごとにまとめる。月かメンバーが読めない行は others */
function groupAllocationRows(rows: readonly AllocationRow[]): { grouped: Map<string, AllocationRow[]>; others: AllocationRow[] } {
	const grouped = new Map<string, AllocationRow[]>();
	const others: AllocationRow[] = [];
	for (const row of rows) {
		const month = row.month.trim();
		if (!isYearMonth(month) || !isReadable(row.member, 'user')) {
			others.push(row);
			continue;
		}
		const key = matrixKey(row.member, month);
		grouped.set(key, [...(grouped.get(key) ?? []), row]);
	}
	return { grouped, others };
}

/** 表の行をマス目にする。extra の月・メンバー（期間・作業ログのある人など）も並べる。同じ月・メンバーの行は合計を出す */
export function allocationMatrix(
	rows: readonly AllocationRow[],
	extra: { months: readonly YearMonth[]; members: readonly NoteId[] },
	title: (id: string) => string,
): AllocationMatrix {
	const { grouped, others } = groupAllocationRows(rows);
	const months = new Set(extra.months);
	const members = new Set(extra.members);
	const cells = new Map<string, string>();
	for (const [key, group] of grouped) {
		const [first] = group;
		if (first) {
			months.add(first.month.trim());
			members.add(first.member);
		}
		cells.set(key, cellValue(group));
	}
	return {
		months: [...months].sort(),
		members: [...members].sort((a, b) => compareJa(title(a) || a, title(b) || b)),
		cells,
		others,
	};
}

/** マス目の値。1行ならその値、複数行なら合計（読めない値があれば1行目の値） */
function cellValue(group: readonly AllocationRow[]): string {
	if (group.length === 1) return group[0]?.hours.trim() ?? '';
	const hours = group.map((r) => parseHours(r.hours));
	return hours.every((h) => h !== null) ? String(hours.reduce((a: number, h) => a + (h ?? 0), 0)) : (group[0]?.hours.trim() ?? '');
}

/**
 * マス目の編集を確かめ、表の書き換えにする（設計書 4.7）
 * 変えていないマスの行は1文字も変えない。変えたマスは1行目を書き換えて残りの行を消し、空にしたら行を消す
 */
export function allocationMatrixEdits(
	matrix: AllocationMatrix,
	initialRows: readonly AllocationRow[],
	title: (id: string) => string,
): TableEditResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const edits: TableEdit[] = [];
	const keep = (row: AllocationRow) => {
		if (row.line !== undefined) edits.push({ line: row.line, changed: false, cells: {} });
	};
	const { grouped: rowsOf } = groupAllocationRows(initialRows);
	// 消さなかった読めない行は残す
	for (const row of matrix.others) keep(row);

	const added: TableEdit[] = [];
	for (const month of matrix.months) {
		for (const member of matrix.members) {
			const key = matrixKey(member, month);
			const value = (matrix.cells.get(key) ?? '').trim();
			const rows = rowsOf.get(key) ?? [];
			if (value === (rows.length > 0 ? cellValue(rows) : '')) {
				rows.forEach(keep);
				continue;
			}
			if (value === '') continue;
			if (parseHours(value) === null) {
				errors.push(`工数配分 ${title(member) || member} ${month}：配分は0以上で0.25刻みの数値で入力してください（例：80）`);
				continue;
			}
			const cells = { month, member: linkCell(member, 'user', title), hours: value };
			const [first] = rows;
			if (first?.line !== undefined) edits.push({ line: first.line, changed: true, cells });
			else added.push({ changed: true, cells });
			if (rows.length > 1) warnings.push(`工数配分 ${title(member) || member} ${month}：同じ月・メンバーの行を1行にまとめました`);
		}
	}
	return { errors, warnings, edits: [...edits, ...added] };
}
