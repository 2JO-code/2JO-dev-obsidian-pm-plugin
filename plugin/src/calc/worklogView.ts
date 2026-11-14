import {
	gridLines,
	parseGridUnit,
	sumEstimates,
	sumHours,
	tasksWithHours,
	type GridHours,
	type GridLine,
	type GridMode,
	type GridTaskInfo,
	type GridUnit,
} from './worklogCells';
import { compareJa } from './compare';
import { cellHoursText, hoursText } from './format';
import type { IsoDate, Member, NoteId, Task } from '../model';
import { isRecord, stringArray } from '../parse/values';

/** 作業ログのビュー（見るだけ）の行の組み立て（設計書 9.10） */

/** 表示する値。予定だけ・実績だけ・両方（日の中に予定と実績の2列） */
export type WorklogViewMode = GridMode | 'both';

/** 表示する値の、日の中の列（左から） */
export function worklogColumns(mode: WorklogViewMode): GridMode[] {
	return mode === 'both' ? ['planned', 'actual'] : [mode];
}

/** ビューの状態として保存する表示の設定 */
export interface WorklogViewOptions {
	unit: GridUnit;
	mode: WorklogViewMode;
	/** 記録の無い、担当の未完了タスクも出すか */
	showAssigned: boolean;
	/** 記録の無い担当タスクに、完了・停止したものも含めるか */
	showFinished: boolean;
	/** たたんだ行のキー */
	collapsed: string[];
}

export const DEFAULT_WORKLOG_VIEW: WorklogViewOptions = { unit: 'week', mode: 'both', showAssigned: false, showFinished: false, collapsed: [] };

/** 保存されていた表示の設定を読む。不正な値は既定値にする */
export function parseWorklogViewOptions(raw: unknown): WorklogViewOptions {
	const data = isRecord(raw) ? raw : {};
	return {
		unit: parseGridUnit(data.unit),
		mode: data.mode === 'planned' || data.mode === 'actual' ? data.mode : 'both',
		showAssigned: data.showAssigned === true,
		showFinished: data.showFinished === true,
		collapsed: stringArray(data.collapsed),
	};
}

/** マスの幅を見積もる寸法(px)。数字1字・余白・最小の幅 */
const CELL_WIDTH = { digit: 7, padding: 8, min: 28 };

/** 予定か実績の1列の幅(px)。いちばん長い文字が見切れない幅にする（設計書 9.10） */
export function worklogCellWidth(texts: Iterable<string>): number {
	let width = CELL_WIDTH.min;
	for (const t of texts) width = Math.max(width, CELL_WIDTH.padding + t.length * CELL_WIDTH.digit);
	return width;
}

/**
 * 並べるメンバー。絞り込みがあればその人、無ければ在籍者と、期間に記録のある退職者。名前順
 * @param selected 絞り込みのメンバー（空は絞らない）
 */
export function worklogViewMembers(
	members: readonly Pick<Member, 'id' | 'title' | 'active'>[],
	selected: readonly NoteId[],
	hasRecords: (member: NoteId) => boolean,
): Pick<Member, 'id' | 'title' | 'active'>[] {
	const shown = members.filter((m) => (selected.length > 0 ? selected.includes(m.id) : m.active || hasRecords(m.id)));
	return [...shown].sort((a, b) => compareJa(a.title, b.title));
}

/** タスクの絞り込み。一覧が空なら絞らない */
export interface WorklogTaskFilter {
	projects: readonly NoteId[];
	/** ステータス名（現在の名前） */
	statuses: readonly string[];
}

/**
 * メンバーの記録を並べるタスク：期間に記録のあるタスクと、assigned（担当の未完了タスク）。
 * 絞り込みがあれば、合うタスクだけ（見つからないタスクは出さない）
 * @param infoOf タスクのプロジェクトと、ステータスの現在の名前
 */
export function worklogViewTasks(
	hours: ReadonlyMap<string, GridHours>,
	assigned: readonly NoteId[],
	filter: WorklogTaskFilter,
	infoOf: (task: NoteId) => { project: NoteId; status: string } | undefined,
): NoteId[] {
	const ids = [...new Set([...tasksWithHours(hours), ...assigned])];
	const { projects, statuses } = filter;
	if (projects.length === 0 && statuses.length === 0) return ids;
	return ids.filter((id) => {
		const info = infoOf(id);
		if (!info) return false;
		return (projects.length === 0 || projects.includes(info.project)) && (statuses.length === 0 || statuses.includes(info.status));
	});
}

/**
 * ビューの1行。入力フォームと同じプロジェクト → エピック → タスクの行。
 * 記録した人が2人以上のタスクだけ、下に人ごとの行を置く
 */
export interface WorklogViewLine extends Omit<GridLine, 'kind'> {
	kind: 'member' | GridLine['kind'];
	/** その人の記録の行のメンバー（メンバーの行と、記録した人が1人のタスクの行。ほかは空） */
	member: NoteId;
	/** 値を合計するタスクとメンバーの組 */
	pairs: [task: NoteId, member: NoteId][];
}

/**
 * メンバーごとの担当タスク（記録の無い担当タスクも出すときに使う）
 * @param isFinished 完了・停止したタスクか。includeFinished が false なら除く
 */
export function worklogAssignedTasks<T extends Pick<Task, 'id' | 'assignees'>>(
	tasks: readonly T[],
	includeFinished: boolean,
	isFinished: (task: T) => boolean,
): Map<NoteId, NoteId[]> {
	const assigned = new Map<NoteId, NoteId[]>();
	for (const t of tasks) {
		if (!includeFinished && isFinished(t)) continue;
		for (const a of t.assignees) assigned.set(a, [...(assigned.get(a) ?? []), t.id]);
	}
	return assigned;
}

/**
 * タスクごとに、その下に並べるメンバー（並べるメンバーの順）。担当タスクは在籍者だけに足す
 * @param assignedOf メンバーごとの担当タスク（worklogAssignedTasks）
 * @param infoOf タスクのプロジェクトと、ステータスの現在の名前
 */
export function worklogViewPairs(
	members: readonly Pick<Member, 'id' | 'active'>[],
	hoursOf: (member: NoteId) => ReadonlyMap<string, GridHours>,
	assignedOf: ReadonlyMap<NoteId, readonly NoteId[]>,
	filter: WorklogTaskFilter,
	infoOf: (task: NoteId) => { project: NoteId; status: string } | undefined,
): Map<NoteId, NoteId[]> {
	const pairs = new Map<NoteId, NoteId[]>();
	for (const m of members) {
		const assigned = m.active ? (assignedOf.get(m.id) ?? []) : [];
		for (const task of worklogViewTasks(hoursOf(m.id), assigned, filter, infoOf)) {
			pairs.set(task, [...(pairs.get(task) ?? []), m.id]);
		}
	}
	return pairs;
}

/** 合計・見積の欄の最小の幅(px)。合計は列（予定・実績）の数で割る */
const MIN_WIDTH = { total: 64, estimate: 56 };

/** 作業ログのビューの表に出す文字と幅 */
export interface WorklogViewTable {
	/** 行ごとの日のマスの文字（日 × 列）。値は配下の合計 */
	cells: Map<string, string[][]>;
	/** 日の合計の文字（日 × 列） */
	dayTotals: string[][];
	/** 行ごとの期間の合計の文字（列） */
	rowTotals: Map<string, string[]>;
	/** 期間全体の合計の文字（列） */
	grandTotal: string[];
	/** 期間全体の合計(h)（列） */
	grandHours: number[];
	/** 行ごとの見積(h)の文字。メンバーの行と、見積のあるタスクが無い行は空 */
	estimates: Map<string, string>;
	/** 並べたすべてのタスクの見積(h)の文字 */
	grandEstimate: string;
	/** 予定か実績の1列の幅(px) */
	cellWidth: number;
	/** 合計の欄の1列の幅(px) */
	totalWidth: number;
	/** 見積の欄の幅(px) */
	estimateWidth: number;
}

/**
 * 作業ログのビューの日・行・全体の合計と見積を出す（設計書 9.10）
 * @param lines すべての行（全体の合計はプロジェクトの行の合計）
 * @param visible たたんだ行を除いた、描く行
 * @param value タスク・メンバー・日の予定か実績(h)の文字
 */
export function worklogViewTable(input: {
	lines: readonly WorklogViewLine[];
	visible: readonly WorklogViewLine[];
	dates: readonly IsoDate[];
	columns: readonly GridMode[];
	value: (task: NoteId, member: NoteId, date: IsoDate, mode: GridMode) => string;
	estimateOf: (task: NoteId) => number | undefined;
}): WorklogViewTable {
	const { lines, visible, dates, columns, value, estimateOf } = input;
	const sum = (line: WorklogViewLine, ds: readonly IsoDate[], m: GridMode) => sumHours(line.pairs.flatMap(([t, mem]) => ds.map((d) => value(t, mem, d, m))));
	const projectLines = lines.filter((l) => l.kind === 'project');
	const total = (ds: readonly IsoDate[], m: GridMode) => projectLines.reduce((s, l) => s + sum(l, ds, m), 0);
	const text = cellHoursText;

	const cells = new Map(visible.map((l) => [l.key, dates.map((d) => columns.map((m) => text(sum(l, [d], m))))]));
	const dayTotals = dates.map((d) => columns.map((m) => text(total([d], m))));
	const rowTotals = new Map(visible.map((l) => [l.key, columns.map((m) => text(sum(l, dates, m)))]));
	const grandHours = columns.map((m) => total(dates, m));
	const grandTotal = grandHours.map(text);

	const estimateText = (tasks: readonly NoteId[]) => {
		const e = sumEstimates(tasks, estimateOf);
		return e === null ? '' : hoursText(e);
	};
	const estimates = new Map(visible.map((l) => [l.key, l.kind === 'member' ? '' : estimateText(l.tasks)]));
	const grandEstimate = estimateText(projectLines.flatMap((l) => l.tasks));

	return {
		cells,
		dayTotals,
		rowTotals,
		grandTotal,
		grandHours,
		estimates,
		grandEstimate,
		cellWidth: worklogCellWidth([...[...cells.values()].flat(2), ...dayTotals.flat()]),
		// 合計の欄も、いちばん長い合計に合わせる
		totalWidth: Math.max(MIN_WIDTH.total / columns.length, worklogCellWidth([...[...rowTotals.values()].flat(), ...grandTotal])),
		estimateWidth: Math.max(MIN_WIDTH.estimate, worklogCellWidth([...estimates.values(), grandEstimate])),
	};
}

/**
 * 行を並べる（ガントと同じ順。設計書 9.10）。
 * @param pairs タスクと、その下に並べるメンバー（名前順にする）
 */
export function worklogViewLines(
	pairs: ReadonlyMap<NoteId, readonly NoteId[]>,
	infoOf: (id: NoteId) => GridTaskInfo | undefined,
	memberName: (id: NoteId) => string,
): WorklogViewLine[] {
	const membersOf = (task: NoteId) => [...(pairs.get(task) ?? [])].sort((a, b) => compareJa(memberName(a), memberName(b)));
	const pairsOf = (tasks: readonly NoteId[]) => tasks.flatMap((t) => membersOf(t).map((m): [NoteId, NoteId] => [t, m]));
	return gridLines([...pairs.keys()], infoOf).flatMap((l): WorklogViewLine[] => {
		const line: WorklogViewLine = { ...l, member: '', pairs: pairsOf(l.tasks) };
		if (l.kind !== 'task') return [line];
		const shown = membersOf(l.key);
		// 記録した人が1人なら、タスクの行をその人の行にする（担当者は1人までのため）
		const [only] = shown;
		if (shown.length === 1 && only !== undefined) return [{ ...line, member: only }];
		const members = shown.map(
			(m): WorklogViewLine => ({
				kind: 'member',
				key: `${l.key}|m:${m}`,
				depth: l.depth + 1,
				parents: [...l.parents, l.key],
				label: memberName(m),
				wbs: '',
				tasks: [l.key],
				member: m,
				pairs: [[l.key, m]],
			}),
		);
		return [line, ...members];
	});
}
