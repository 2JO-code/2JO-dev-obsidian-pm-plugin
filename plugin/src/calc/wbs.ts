import type { Epic, NoteId, Project, Task } from '../model';
import { compareNumeric } from './compare';
import type { CalcContext } from './context';
import { filterProjects, filterTasks, type ViewFilter } from './filter';
import { projectStatus, type EpicRow, type ProjectStatus } from './projectStatus';
import { sortTaskRows, taskRows, type RowLabels, type TaskRow } from './taskList';
import { sortByWbs, type Numbered } from './wbsOrder';

export interface WbsEpic {
	row: EpicRow;
	/** 表示するタスク（絞り込み済み）。番号順、番号の無いものは計算上の開始日の順で後ろ */
	tasks: TaskRow[];
	/** エピックの全タスク（絞り込まない）。tasks と同じ順。ドラッグでの振り直しに使う */
	order: Numbered[];
}

export interface WbsProject {
	status: ProjectStatus;
	epics: WbsEpic[];
}

/**
 * WBS の階層（要件4.8b、設計書 11.12）。タスクは番号順（設計書 11.17）。進捗・工数・期間は絞り込みに関係なくエピック・プロジェクト全体で出す。
 * @param visible 担当者・ステータスで絞り込んだタスクのID。undefined なら絞り込みなし。
 *   絞り込んでいるときは、表示するタスクの無いエピックを出さない
 */
export function wbsTree(
	ctx: CalcContext,
	projects: readonly Project[],
	visible: ReadonlySet<NoteId> | undefined,
	labels: RowLabels,
	statusOrder: readonly string[],
): WbsProject[] {
	return projects.map((project) => {
		const status = projectStatus(ctx, project);
		const epics = status.epics
			.map((row) => {
				const all = wbsTaskRows(ctx, row.tasks, labels, statusOrder);
				const rows = visible ? all.filter((r) => visible.has(r.task.id)) : all;
				return { row, tasks: rows, order: numberedOf(all.map((r) => r.task)) };
			})
			.filter((e) => !visible || e.tasks.length > 0);
		return { status, epics };
	});
}

/** タスクの行を WBS 番号順に。番号の無いものは計算上の開始日の順で後ろ（設計書 11.17） */
export function wbsTaskRows(ctx: CalcContext, tasks: readonly Task[], labels: RowLabels, statusOrder: readonly string[]): TaskRow[] {
	return sortByWbs(sortTaskRows(taskRows(ctx, tasks), 'start', false, labels, statusOrder), (r) => r.task.wbs);
}

/** ドラッグでの振り直しに渡す、ID と番号の並び */
export const numberedOf = (notes: readonly (Epic | Task)[]): Numbered[] => notes.map((n) => ({ id: n.id, ...(n.wbs ? { wbs: n.wbs } : {}) }));

/** プロジェクトのエピックの並び（エピックなしを除く）。エピックのドラッグに使う */
export const epicOrderOf = (status: ProjectStatus): Numbered[] => numberedOf(status.epics.flatMap(({ epic }) => (epic ? [epic] : [])));

/**
 * 絞り込みに合う WBS の階層（WBS とガントで共通。設計書 9.7・9.8）。
 * プロジェクトは表示名の順。担当者・ステータスで絞り込んでいるときだけ、表示するタスクを絞る（narrowed）
 */
export function wbsTreeFor(
	ctx: CalcContext,
	filter: ViewFilter,
	labels: RowLabels,
): { tree: WbsProject[]; narrowed: boolean } {
	const projects = filterProjects(ctx.index.projects({ includeArchived: filter.includeArchived }), filter, ctx.statuses).sort((a, b) =>
		compareNumeric(labels.project(a), labels.project(b)),
	);
	const narrowed = filter.members.length > 0 || filter.statuses.length > 0;
	const visible = narrowed
		? new Set(filterTasks(ctx.index.tasks({ includeArchived: true }), { ...filter, includeClosed: true }, ctx.projects, ctx.statuses).map((t) => t.id))
		: undefined;
	const tree = wbsTree(ctx, projects, visible, labels, ctx.statuses.task.map((s) => s.name));
	return { tree, narrowed };
}

/** 開閉の状態のキー。プロジェクト・エピック・「エピックなし」を区別する */
export const wbsKey = {
	project: (id: NoteId) => `p:${id}`,
	epic: (project: NoteId, epic: NoteId | undefined) => (epic ? `e:${epic}` : `n:${project}`),
};

/** 初期の開閉：プロジェクトは開き、エピックは閉じる */
export const isOpenByDefault = (key: string) => key.startsWith('p:');

/** 開閉の状態は「初期と逆にした行のキー」で持つ（ビューの状態として保存する） */
export const isOpen = (toggled: ReadonlySet<string>, key: string) => isOpenByDefault(key) !== toggled.has(key);

/** 「すべて開く」（open=true）・「すべて閉じる」にしたときの、初期と逆にした行のキー */
export function toggledForAll(tree: readonly WbsProject[], open: boolean): Set<string> {
	const toggled = new Set<string>();
	for (const p of tree) {
		const projectKey = wbsKey.project(p.status.project.id);
		if (isOpenByDefault(projectKey) !== open) toggled.add(projectKey);
		for (const e of p.epics) {
			const key = wbsKey.epic(p.status.project.id, e.row.epic?.id);
			if (isOpenByDefault(key) !== open) toggled.add(key);
		}
	}
	return toggled;
}

/** 保存されていた開閉の状態を読む */
export const parseToggled = (raw: unknown): Set<string> =>
	new Set(Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : []);
