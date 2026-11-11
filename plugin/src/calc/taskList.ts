import { findStatus } from '../config/status';
import type { Epic, IsoDate, Member, NoteId, Project, StatusCategory, Task } from '../model';
import { compareNumeric } from './compare';
import type { CalcContext } from './context';
import { currentStatusName } from './filter';
import { NO_EPIC_LABEL } from './format';
import { taskProgress, type TaskProgress } from './progress';
import { taskPlanDelay } from './planDelay';
import type { TaskSchedule } from './schedule';
import type { Warning } from './warnings';
import type { Hours } from './worklogSummary';
import { isRecord, stringArray } from '../parse/values';

/** タスク一覧の1行（設計書 11.6） */
export interface TaskRow {
	task: Task;
	project?: Project;
	epic?: Epic;
	/** 現在の名前にそろえたステータス */
	status: string;
	category?: StatusCategory;
	/** 担当者。メンバーが見つからないIDは除く */
	assignees: Member[];
	hours: Hours;
	progress: TaskProgress;
	/** 見込みの日程。出せなければ undefined（設計書 11.9） */
	schedule?: TaskSchedule;
	/** 当初終了日からの遅れ（稼働日）。当初終了日か日程が無ければ undefined（設計書 11.18） */
	planDelay?: number;
	warnings: readonly Warning[];
}

export function taskRows(ctx: CalcContext, tasks: readonly Task[]): TaskRow[] {
	const statuses = ctx.statuses.task;
	return tasks.map((task) => {
		const project = ctx.projects.get(task.project);
		const epic = task.epic ? ctx.epics.get(task.epic) : undefined;
		const schedule = ctx.schedule.schedules.get(task.id);
		const planDelay = taskPlanDelay(task, schedule, ctx.calendar);
		return {
			task,
			...(project ? { project } : {}),
			...(epic ? { epic } : {}),
			status: currentStatusName(task.status, statuses),
			...withCategory(findStatus(statuses, task.status)?.category),
			assignees: task.assignees.flatMap((id) => ctx.members.get(id) ?? []),
			hours: ctx.summary.task(task.id),
			progress: taskProgress(task, statuses),
			...(schedule ? { schedule } : {}),
			...(planDelay !== undefined ? { planDelay } : {}),
			warnings: ctx.warningsOf(task),
		};
	});
}

const withCategory = (category: StatusCategory | undefined) => (category ? { category } : {});

export type TaskGroupBy = 'none' | 'project' | 'epic' | 'status' | 'assignee';

export type TaskSortKey =
	| 'title'
	| 'project'
	| 'epic'
	| 'status'
	| 'assignee'
	| 'start'
	| 'end'
	| 'due'
	| 'planDelay'
	| 'estimate'
	| 'planned'
	| 'actual'
	| 'progress'
	| 'warnings';

/** タスクのビュー（タスク一覧・カンバン）だけの絞り込み。ビュー共通の絞り込みは ViewFilter */
export type TaskFilterOptions = Pick<TaskListOptions, 'epics' | 'dueFrom' | 'dueTo' | 'warningsOnly'>;

export const EMPTY_TASK_FILTER: TaskFilterOptions = { epics: [], warningsOnly: false };

/** タスク一覧だけの表示条件（ビュー共通の絞り込みは ViewFilter） */
export interface TaskListOptions {
	epics: NoteId[];
	dueFrom?: IsoDate;
	dueTo?: IsoDate;
	warningsOnly: boolean;
	groupBy: TaskGroupBy;
	sort: TaskSortKey;
	desc: boolean;
}

export const DEFAULT_TASK_LIST: TaskListOptions = {
	epics: [],
	warningsOnly: false,
	groupBy: 'none',
	sort: 'due',
	desc: false,
};

const GROUP_BYS: readonly TaskGroupBy[] = ['none', 'project', 'epic', 'status', 'assignee'];
const SORT_KEYS: readonly TaskSortKey[] = [
	'title',
	'project',
	'epic',
	'status',
	'assignee',
	'start',
	'end',
	'due',
	'planDelay',
	'estimate',
	'planned',
	'actual',
	'progress',
	'warnings',
];

const date = (v: unknown): IsoDate | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.find((a) => a === v) ?? fallback;

/** 保存されていた表示条件を読む。不正な値は既定値にする */
export function parseTaskListOptions(raw: unknown): TaskListOptions {
	const data = isRecord(raw) ? raw : {};
	const dueFrom = date(data.dueFrom);
	const dueTo = date(data.dueTo);
	return {
		epics: stringArray(data.epics),
		...(dueFrom ? { dueFrom } : {}),
		...(dueTo ? { dueTo } : {}),
		warningsOnly: data.warningsOnly === true,
		groupBy: pick(data.groupBy, GROUP_BYS, DEFAULT_TASK_LIST.groupBy),
		sort: pick(data.sort, SORT_KEYS, DEFAULT_TASK_LIST.sort),
		desc: data.desc === true,
	};
}

/** エピック・期限日の範囲・警告ありのみで絞り込む。範囲を指定したとき期限日の無いタスクは対象外 */
export function filterTaskRows(rows: readonly TaskRow[], options: TaskFilterOptions): TaskRow[] {
	const { epics, dueFrom, dueTo, warningsOnly } = options;
	return rows.filter((r) => {
		if (epics.length > 0 && !(r.task.epic && epics.includes(r.task.epic))) return false;
		if (dueFrom || dueTo) {
			const due = r.task.due;
			if (!due || (dueFrom && due < dueFrom) || (dueTo && due > dueTo)) return false;
		}
		return !warningsOnly || r.warnings.length > 0;
	});
}

/** 並べ替え・グループの見出しに使う名前 */
export interface RowLabels {
	project: (project: Project) => string;
}

export const epicLabel = (epic: Epic): string => (epic.wbs ? `${epic.wbs} ${epic.title}` : epic.title);

/** 値の無いものは昇順・降順どちらでも最後にする */
function compareOptional<T>(a: T | undefined, b: T | undefined, cmp: (a: T, b: T) => number, desc: boolean): number {
	if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
	return desc ? -cmp(a, b) : cmp(a, b);
}

const progressValue = (r: TaskRow) => (r.progress.done ? 1 : (r.progress.subtaskRatio ?? 0));

/** 並べ替える。同じ値ならタイトル順（設計書 11.6） */
export function sortTaskRows(
	rows: readonly TaskRow[],
	key: TaskSortKey,
	desc: boolean,
	labels: RowLabels,
	statusOrder: readonly string[],
): TaskRow[] {
	const order = (s: string) => {
		const i = statusOrder.indexOf(s);
		return i < 0 ? undefined : i;
	};
	const num = (a: number, b: number) => a - b;
	const value = (a: TaskRow, b: TaskRow): number => {
		switch (key) {
			case 'title':
				return desc ? -compareNumeric(a.task.title, b.task.title) : compareNumeric(a.task.title, b.task.title);
			case 'project':
				return compareOptional(a.project && labels.project(a.project), b.project && labels.project(b.project), compareNumeric, desc);
			case 'epic':
				return compareOptional(a.epic && epicLabel(a.epic), b.epic && epicLabel(b.epic), compareNumeric, desc);
			case 'status':
				return compareOptional(order(a.status), order(b.status), num, desc);
			case 'assignee':
				return compareOptional(a.assignees[0]?.title, b.assignees[0]?.title, compareNumeric, desc);
			case 'start':
				return compareOptional(a.schedule?.start, b.schedule?.start, compareNumeric, desc);
			case 'end':
				return compareOptional(a.schedule?.end, b.schedule?.end, compareNumeric, desc);
			case 'due':
				return compareOptional(a.task.due, b.task.due, compareNumeric, desc);
			case 'planDelay':
				return compareOptional(a.planDelay, b.planDelay, num, desc);
			case 'estimate':
				return compareOptional(a.task.estimate, b.task.estimate, num, desc);
			case 'planned':
				return desc ? b.hours.planned - a.hours.planned : a.hours.planned - b.hours.planned;
			case 'actual':
				return desc ? b.hours.actual - a.hours.actual : a.hours.actual - b.hours.actual;
			case 'progress':
				return desc ? progressValue(b) - progressValue(a) : progressValue(a) - progressValue(b);
			case 'warnings':
				return desc ? b.warnings.length - a.warnings.length : a.warnings.length - b.warnings.length;
		}
	};
	return [...rows].sort((a, b) => value(a, b) || compareNumeric(a.task.title, b.task.title));
}

export interface TaskGroup {
	key: string;
	label: string;
	rows: TaskRow[];
}

/** グループに分ける。行の並びは保つ。担当者が複数のタスクはそれぞれのグループに入る（設計書 11.6） */
export function groupTaskRows(
	rows: readonly TaskRow[],
	groupBy: TaskGroupBy,
	labels: RowLabels,
	statusOrder: readonly string[],
): TaskGroup[] {
	if (groupBy === 'none') return [{ key: '', label: '', rows: [...rows] }];

	const groups = new Map<string, TaskGroup>();
	const add = (key: string, label: string, row: TaskRow) => {
		const group = groups.get(key) ?? { key, label, rows: [] };
		group.rows.push(row);
		groups.set(key, group);
	};
	for (const r of rows) {
		switch (groupBy) {
			case 'project':
				add(r.task.project, r.project ? labels.project(r.project) : `（見つからないプロジェクト：${r.task.project}）`, r);
				break;
			case 'epic':
				add(r.task.epic ?? '', r.epic ? epicLabel(r.epic) : r.task.epic ? `（見つからないエピック：${r.task.epic}）` : NO_EPIC_LABEL, r);
				break;
			case 'status':
				add(r.status, r.status, r);
				break;
			case 'assignee':
				if (r.assignees.length === 0) add('', '（担当者なし）', r);
				for (const m of r.assignees) add(m.id, m.title, r);
				break;
		}
	}

	// 名前のある順に並べ、「なし」「見つからない」は最後。ステータスは設定の並び順
	const rank = (g: TaskGroup) => {
		if (groupBy === 'status') {
			const i = statusOrder.indexOf(g.key);
			return i < 0 ? statusOrder.length : i;
		}
		return g.label.startsWith('（') ? 1 : 0;
	};
	return [...groups.values()].sort((a, b) => rank(a) - rank(b) || compareNumeric(a.label, b.label));
}
