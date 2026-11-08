import {
	gridLines,
	parseGridUnit,
	tasksWithHours,
	type GridHours,
	type GridLine,
	type GridMode,
	type GridTaskInfo,
	type GridUnit,
} from './worklogCells';
import { compareJa } from './compare';
import type { Member, NoteId } from '../model';
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
