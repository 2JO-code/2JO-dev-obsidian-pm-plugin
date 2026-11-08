import { compareJa } from '../calc/compare';
import { monthOfDate } from '../calc/dates';
import { EMPTY_HOURS, gridKey, normalizeHours, parseGridKey, sameHours, type GridHours, type GridMode } from '../calc/worklogCells';
import type { IsoDate, NoteId, Task, YearMonth } from '../model';
import { parseHours } from '../parse/values';
import { tableCell, type TableEdit } from '../write/markdownTable';
import { linkCell } from './tableRows';
import type { WorklogRow } from './worklogTable';

/** 作業ログのマス目の入力：変えたマス・検証・作業ログの表への書き換え（設計書 4.3） */

/** 書き込むマス。予定・実績は normalizeHours した値 */
export interface GridChange extends GridHours {
	date: IsoDate;
	task: NoteId;
}

/**
 * 縦に並べるタスク：担当の未完了タスク・その週に記録のあるタスク・画面で足したタスク（設計書 4.3）。
 * sortKey の順（プロジェクト名・タスク名など）に並べ、重ねない
 */
export function gridTaskIds(groups: readonly (readonly NoteId[])[], sortKey: (id: NoteId) => string): NoteId[] {
	const ids = [...new Set(groups.flat())];
	const keys = new Map(ids.map((id) => [id, sortKey(id)]));
	return ids.sort((a, b) => compareJa(keys.get(a) ?? '', keys.get(b) ?? ''));
}

/** メンバーが担当するタスク。includeFinished でなければ未完了（isOpen）だけ */
export function assignedTaskIds(
	tasks: readonly Pick<Task, 'id' | 'assignees'>[],
	member: NoteId,
	isOpen: (task: NoteId) => boolean,
	includeFinished: boolean,
): NoteId[] {
	return tasks.filter((t) => t.assignees.includes(member) && (includeFinished || isOpen(t.id))).map((t) => t.id);
}

/** 入力画面の絞り込み。空は絞らない */
export interface GridFilter {
	project: NoteId;
	epic: NoteId;
	/** ステータス名（現在の名前） */
	status: string;
}

/**
 * プロジェクト・エピック・ステータスで絞った行。見つからないタスクは絞るときは出さない
 * @param taskOf タスクの所属と、ステータスの現在の名前
 */
export function filterGridTasks(
	ids: readonly NoteId[],
	taskOf: (id: NoteId) => Pick<Task, 'project' | 'epic' | 'status'> | undefined,
	filter: GridFilter,
): NoteId[] {
	const { project, epic, status } = filter;
	if (!project && !epic && !status) return [...ids];
	return ids.filter((id) => {
		const t = taskOf(id);
		return t !== undefined && (!project || t.project === project) && (!epic || t.epic === epic) && (!status || t.status === status);
	});
}

/** マスの今の値。入力していればその値、無ければ記録の値 */
export function cellHours(key: string, edits: ReadonlyMap<string, GridHours>, base: ReadonlyMap<string, GridHours>): GridHours {
	return edits.get(key) ?? base.get(key) ?? EMPTY_HOURS;
}

/** マスの予定か実績を、記録から変えたか（保存前の変更） */
export function cellEdited(key: string, mode: GridMode, edits: ReadonlyMap<string, GridHours>, base: ReadonlyMap<string, GridHours>): boolean {
	const edit = edits.get(key);
	return !!edit && normalizeHours(edit[mode]) !== normalizeHours((base.get(key) ?? EMPTY_HOURS)[mode]);
}

/** 入力したマスのうち、記録と値が違うもの */
export function gridChanges(edits: ReadonlyMap<string, GridHours>, base: ReadonlyMap<string, GridHours>): GridChange[] {
	const changes: GridChange[] = [];
	for (const [key, h] of edits) {
		if (sameHours(h, base.get(key) ?? EMPTY_HOURS)) continue;
		changes.push({ ...parseGridKey(key), planned: normalizeHours(h.planned), actual: normalizeHours(h.actual) });
	}
	return changes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 保存した値のうち、索引に同じ値が載ったマスのキー（重ねて出すのをやめてよいもの） */
export function savedInIndex(saved: ReadonlyMap<string, GridHours>, index: ReadonlyMap<string, GridHours>): string[] {
	return [...saved].filter(([key, h]) => sameHours(h, index.get(key) ?? EMPTY_HOURS)).map(([key]) => key);
}

/** 変えたマスを月ごとに分ける（作業ログは1か月で1ファイルのため）。月は出てきた順 */
export function changesByMonth(changes: readonly GridChange[]): { month: YearMonth; changes: GridChange[] }[] {
	const groups = new Map<YearMonth, GridChange[]>();
	for (const c of changes) {
		const month = monthOfDate(c.date);
		const group = groups.get(month);
		if (group) group.push(c);
		else groups.set(month, [c]);
	}
	return [...groups].map(([month, part]) => ({ month, changes: part }));
}

/** 保存したあとの知らせの文（1行目は保存したマスの数） */
export function worklogSavedNotice(cells: number, merged: number, droppedMemos: number): string[] {
	const notes = [`作業ログを保存しました（${cells} マス）`];
	if (merged > 0) notes.push(`同じ日付・タスクの行 ${merged} 行を1行にまとめました`);
	if (droppedMemos > 0) notes.push(`消した記録のメモ ${droppedMemos} 件も消えました`);
	return notes;
}

/** 書き込むマスの誤り。label はマスの名前（日付とタスク） */
export function validateGridChanges(changes: readonly GridChange[], label: (c: GridChange) => string): string[] {
	const errors: string[] = [];
	for (const c of changes) {
		for (const [mode, name] of [['planned', '予定'], ['actual', '実績']] as const) {
			if (c[mode] !== '' && parseHours(c[mode]) === null) errors.push(`${label(c)} の${name}は0以上で0.25刻みの数値で入力してください（例：1.5）`);
		}
	}
	return errors;
}

export interface GridEditResult {
	edits: TableEdit[];
	/** 1行にまとめた（消した）重複の行の数 */
	merged: number;
	/** 消した行のうち、メモのあった行の数 */
	droppedMemos: number;
}

/**
 * マスの変更を、作業ログの表の書き換えにする（設計書 4.3）。
 * 変えたマスは、その日付・タスクの1行目を書き換えて残りの行を消す。メモはつなげて残す。
 * 予定・実績とも空にしたマスは行を消す。行の無いマスは行を足す
 */
export function worklogGridEdits(rows: readonly WorklogRow[], changes: readonly GridChange[], title: (id: string) => string): GridEditResult {
	const byKey = new Map(changes.map((c) => [gridKey(c.date, c.task), c]));
	const groups = new Map<string, WorklogRow[]>();
	for (const row of rows) {
		const key = gridKey(row.date.trim(), row.task);
		if (byKey.has(key)) groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	const cells = (c: GridChange, memo: string) => ({
		date: c.date,
		task: linkCell(c.task, 'task', title),
		planned: c.planned,
		actual: c.actual,
		memo: tableCell(memo),
	});

	let merged = 0;
	let droppedMemos = 0;
	const edits: TableEdit[] = [];
	for (const row of rows) {
		const key = gridKey(row.date.trim(), row.task);
		const change = byKey.get(key);
		const group = groups.get(key);
		if (!change || !group) {
			edits.push({ ...(row.line !== undefined ? { line: row.line } : {}), changed: false, cells: {} });
			continue;
		}
		if (group[0] !== row) continue;
		const memos = group.map((r) => r.memo.trim()).filter((m) => m !== '');
		if (change.planned === '' && change.actual === '') {
			droppedMemos += memos.length;
			continue;
		}
		merged += group.length - 1;
		edits.push({ ...(row.line !== undefined ? { line: row.line } : {}), changed: true, cells: cells(change, memos.join(' / ')) });
	}
	for (const [key, c] of byKey) {
		if (groups.has(key) || (c.planned === '' && c.actual === '')) continue;
		edits.push({ changed: true, cells: cells(c, '') });
	}
	return { edits, merged, droppedMemos };
}

/** タスクから開くときに最初に選ぶメンバー。前回の人が担当者ならその人、担当者が1人（在籍）ならその人、ほかは前回の人（設計書 4.3） */
export function defaultWorklogMember(remembered: NoteId, assignees: readonly NoteId[], active: readonly NoteId[]): NoteId {
	if (assignees.includes(remembered)) return remembered;
	const [only] = assignees;
	if (assignees.length === 1 && only !== undefined && active.includes(only)) return only;
	return remembered;
}
