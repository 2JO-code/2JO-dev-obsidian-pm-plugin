import { findStatus } from '../config/status';
import type { IsoDate, NoteId, Project, StatusDef, StatusSets, Task } from '../model';

/** ビュー共通の絞り込み（要件4.1）。一覧が空なら「すべて」 */
export interface ViewFilter {
	projects: NoteId[];
	members: NoteId[];
	/** ステータス名（現在の名前） */
	statuses: string[];
	start?: IsoDate;
	end?: IsoDate;
	/** クローズ済み（完了系）のプロジェクトも表示するか */
	includeClosed: boolean;
	/** アーカイブ内のノートも表示するか */
	includeArchived: boolean;
}

export const EMPTY_FILTER: ViewFilter = {
	projects: [],
	members: [],
	statuses: [],
	includeClosed: false,
	includeArchived: false,
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const date = (v: unknown): IsoDate | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** 保存されていた絞り込み（ビューの状態）を読む。不正な値は既定値にする */
export function parseFilter(raw: unknown): ViewFilter {
	const data = isRecord(raw) ? raw : {};
	const start = date(data.start);
	const end = date(data.end);
	return {
		projects: strings(data.projects),
		members: strings(data.members),
		statuses: strings(data.statuses),
		...(start ? { start } : {}),
		...(end ? { end } : {}),
		includeClosed: data.includeClosed === true,
		includeArchived: data.includeArchived === true,
	};
}

/** クローズ済みのプロジェクトか（ステータスが完了系。要件4.9） */
export function isClosed(project: Project, statuses: StatusSets): boolean {
	return findStatus(statuses.project, project.status)?.category === 'done';
}

/** 期間（start〜end）と、開始日〜期限日が重なるか。日付の無いタスクは期間を指定したときは対象外 */
function overlaps(task: Task, start?: IsoDate, end?: IsoDate): boolean {
	if (!start && !end) return true;
	const from = task.start ?? task.due;
	const to = task.due ?? task.start;
	if (!from || !to) return false;
	return (!end || from <= end) && (!start || to >= start);
}

/** ステータス名を現在の名前にそろえる（旧名を新しい名前に。設定に無ければそのまま） */
export function currentStatusName(value: string, statuses: readonly StatusDef[]): string {
	return findStatus(statuses, value)?.name ?? value;
}

/**
 * タスクを絞り込む（アーカイブの扱いは呼び出し側が索引から取るときに決める）
 * @param projects 所属プロジェクトを引くための一覧
 */
export function filterTasks(
	tasks: readonly Task[],
	filter: ViewFilter,
	projects: ReadonlyMap<NoteId, Project>,
	statuses: StatusSets,
): Task[] {
	return tasks.filter((t) => {
		if (filter.projects.length > 0 && !filter.projects.includes(t.project)) return false;
		if (filter.members.length > 0 && !t.assignees.some((a) => filter.members.includes(a))) return false;
		if (filter.statuses.length > 0 && !filter.statuses.includes(currentStatusName(t.status, statuses.task))) return false;
		if (!overlaps(t, filter.start, filter.end)) return false;
		const project = projects.get(t.project);
		if (!filter.includeClosed && project && isClosed(project, statuses)) return false;
		return true;
	});
}

/** プロジェクトを絞り込む（プロジェクトの指定とクローズ済みの表示） */
export function filterProjects(projects: readonly Project[], filter: ViewFilter, statuses: StatusSets): Project[] {
	return projects.filter(
		(p) =>
			(filter.projects.length === 0 || filter.projects.includes(p.id)) && (filter.includeClosed || !isClosed(p, statuses)),
	);
}
