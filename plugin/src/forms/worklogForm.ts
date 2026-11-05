import type { NoteId, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import { findTableUnderHeading, normalizeLabel } from '../parse/markdownTable';
import { isIsoDate, parseHours, parseLinkId } from '../parse/values';
import { appendTable, tableCell, tableLink, tableRow } from '../write/markdownTable';

/** 作業ログの入力フォームの値（設計書 4.3） */
export interface WorklogInput {
	member: NoteId;
	date: string;
	task: NoteId;
	/** 予定(h)。空欄可 */
	planned: string;
	/** 実績(h)。空欄可 */
	actual: string;
	memo: string;
}

export interface WorklogEntryValue {
	date: string;
	task: NoteId;
	taskTitle: string;
	planned: number | null;
	actual: number | null;
	memo: string;
}

export function validateWorklogInput(input: WorklogInput): string[] {
	const errors: string[] = [];
	if (!input.member) errors.push('メンバーを選んでください');
	if (!isIsoDate(input.date)) errors.push('日付を選んでください');
	if (!input.task) errors.push('タスクを選んでください');
	const planned = input.planned.trim();
	const actual = input.actual.trim();
	if (planned === '' && actual === '') errors.push('予定か実績のどちらかを入力してください');
	if (planned !== '' && parseHours(planned) === null) errors.push('予定は0以上で0.25刻みの数値で入力してください（例：1.5）');
	if (actual !== '' && parseHours(actual) === null) errors.push('実績は0以上で0.25刻みの数値で入力してください（例：1.5）');
	return errors;
}

/** タスクから開くときに最初に選ぶメンバー。前回の人が担当者ならその人、担当者が1人（在籍）ならその人、ほかは前回の人（設計書 4.3） */
export function defaultWorklogMember(remembered: NoteId, assignees: readonly NoteId[], active: readonly NoteId[]): NoteId {
	if (assignees.includes(remembered)) return remembered;
	const [only] = assignees;
	if (assignees.length === 1 && only !== undefined && active.includes(only)) return only;
	return remembered;
}

/** 日付から対象月（作業ログのファイル）を決める */
export function monthOf(date: string): YearMonth {
	return date.slice(0, 7);
}

const hours = (h: number | null) => (h === null ? '' : String(h));

/** 作業ログの表の1行（列の順は TABLE_SPEC.worklog） */
export function formatWorklogRow(e: WorklogEntryValue): string {
	return tableRow([e.date, tableLink(e.task, e.taskTitle), hours(e.planned), hours(e.actual), tableCell(e.memo)]);
}

export interface UpsertResult {
	content: string;
	/** 既存の行を書き換えたか（false なら追加） */
	updated: boolean;
}

/** 作業ログの本文に行を追加、または同じ日付・タスクの行を書き換える（設計書 4.3） */
export function upsertWorklogRow(content: string, entry: WorklogEntryValue): UpsertResult {
	const row = formatWorklogRow(entry);
	const table = findTableUnderHeading(content, TABLE_SPEC.worklog.heading);
	const lines = content.split('\n');

	if (!table) return { content: appendTable(content, TABLE_SPEC.worklog, [row]), updated: false };

	const col = (label: string) => table.headers.indexOf(normalizeLabel(label));
	const dateCol = col(TABLE_SPEC.worklog.columns.date);
	const taskCol = col(TABLE_SPEC.worklog.columns.task);
	const same = table.rows.find(
		(r) => r.cells[dateCol] === entry.date && parseLinkId(r.cells[taskCol] ?? '', 'task') === entry.task,
	);
	// 改行コード（CRLF）を保つ
	const eol = (line: number) => ((lines[line] ?? '').endsWith('\r') ? '\r' : '');
	if (same) {
		lines[same.line] = row + eol(same.line);
		return { content: lines.join('\n'), updated: true };
	}

	const before = table.rows.filter((r) => (r.cells[dateCol] ?? '') <= entry.date);
	const after = before.at(-1)?.line ?? table.rows.at(-1)?.line ?? table.headerLine + 1;
	// 一番古い日付なら区切り行の直後
	const insertAt = before.length === 0 && table.rows.length > 0 ? table.headerLine + 2 : after + 1;
	lines.splice(insertAt, 0, row + eol(table.headerLine));
	return { content: lines.join('\n'), updated: false };
}
