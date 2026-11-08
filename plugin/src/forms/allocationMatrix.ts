import { compareJa } from '../calc/compare';
import { addMonths, monthOfDate } from '../calc/dates';
import type { NoteId, YearMonth } from '../model';
import { isYearMonth, parseHours } from '../parse/values';
import type { TableEdit } from '../write/markdownTable';
import { isReadable } from './formValues';
import type { AllocationRow } from './projectTables';
import { linkCell, type TableEditResult } from './tableRows';

/** 工数配分の編集画面のマス目の値と、その変え方（設計書 4.7）。表の行の読み書きは projectTables.ts */

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


/** メンバーの、配分の入っているマス（月の順）。行を消す前の確認に出す */
export function memberAllocations(matrix: AllocationMatrix, member: NoteId): { month: YearMonth; hours: string }[] {
	return matrix.months
		.map((month) => ({ month, hours: (matrix.cells.get(matrixKey(member, month)) ?? '').trim() }))
		.filter((c) => c.hours !== '');
}

/** 表の行のほかに並べる月・メンバー。プロジェクトの期間の月・責任者と、作業ログのある月×メンバー */
export function allocationExtra(
	project: { start?: string; due?: string; manager?: NoteId } | null,
	logged: readonly { month: YearMonth; member: NoteId }[],
): { months: YearMonth[]; members: NoteId[] } {
	const months: YearMonth[] = [];
	const members: NoteId[] = [];
	if (project?.start && project.due) months.push(...monthRange(monthOfDate(project.start), monthOfDate(project.due)));
	if (project?.manager) members.push(project.manager);
	for (const key of logged) {
		months.push(key.month);
		members.push(key.member);
	}
	return { months, members };
}

/** 足せるメンバー。在籍者のうちマス目にいない人（名前順） */
export function memberCandidates<M extends { id: NoteId; title: string; active: boolean }>(members: readonly M[], matrix: AllocationMatrix): M[] {
	return members.filter((m) => m.active && !matrix.members.includes(m.id)).sort((a, b) => compareJa(a.title, b.title));
}

/** メンバーを足す。足したら、その人の最初の月のマスのキー（月が無ければ null）。足せなければ undefined */
export function addMatrixMember(matrix: AllocationMatrix, member: NoteId): string | null | undefined {
	if (member === '' || matrix.members.includes(member)) return undefined;
	matrix.members.push(member);
	const [first] = matrix.months;
	return first ? matrixKey(member, first) : null;
}

/** 月を足して月の順に並べる。足したら、最初のメンバーのその月のマスのキー（メンバーが無ければ null）。足せなければ undefined */
export function addMatrixMonth(matrix: AllocationMatrix, value: string): string | null | undefined {
	const month = value.trim();
	if (!isYearMonth(month) || matrix.months.includes(month)) return undefined;
	matrix.months.push(month);
	matrix.months.sort();
	const [first] = matrix.members;
	return first ? matrixKey(first, month) : null;
}

/** メンバーの行と、その人の配分をすべて消す */
export function removeMatrixMember(matrix: AllocationMatrix, member: NoteId): void {
	const i = matrix.members.indexOf(member);
	if (i < 0) return;
	matrix.members.splice(i, 1);
	for (const month of matrix.months) matrix.cells.delete(matrixKey(member, month));
}

/** メンバーの行を消す前の確認に出す、消える配分の説明 */
export function removedAllocationText(matrix: AllocationMatrix, member: NoteId): string {
	const filled = memberAllocations(matrix, member);
	return filled.length > 0 ? `消す配分：${filled.map((c) => `${c.month} ${c.hours}h`).join('、')}` : '配分の入っているマスはありません';
}

/** 予定が配分を超えていれば、その配分(h)。超えていない・配分が空か読めなければ null */
export function overAllocated(value: string, planned: number): number | null {
	const allocated = parseHours(value);
	return allocated !== null && planned > allocated ? allocated : null;
}
