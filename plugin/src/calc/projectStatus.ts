import { findStatus } from '../config/status';
import type { Epic, IsoDate, Milestone, NoteId, Project, StatusCategory, Task, YearMonth } from '../model';
import { compareNumeric } from './compare';
import type { CalcContext } from './context';
import { countProgress, workload, type CountProgress, type Workload } from './progress';
import { allocationWarnings, taskWarnings, type Warning } from './warnings';

/** 進捗・工数・警告のまとまり（プロジェクト全体とエピックごとに使う） */
export interface Status {
	tasks: Task[];
	progress: CountProgress;
	workload: Workload;
	warnings: Warning[];
	/** タスクの計算上の日程の最も早い開始日〜最も遅い終了日。日程のあるタスクが無ければ undefined */
	span?: { start: IsoDate; end: IsoDate };
}

export interface EpicRow extends Status {
	/** undefined は「エピックなし」のタスクのまとまり */
	epic?: Epic;
	category?: StatusCategory;
}

export interface MilestoneRow {
	milestone: Milestone;
	/** 連動エピック。指定が無いか見つからなければ undefined */
	epic?: EpicRow;
	/** 連動エピックの完了予定日がマイルストーンの日付より後 */
	late: boolean;
	/** マイルストーンの日付を過ぎたのに、連動エピックが完了系でない */
	missed: boolean;
}

export interface AllocationCell {
	/** 配分工数。配分表に無ければ undefined */
	hours?: number;
	/** 配分表の行（ノートを開く位置） */
	line?: number;
	planned: number;
	actual: number;
	over: boolean;
}

export interface AllocationTable {
	months: YearMonth[];
	members: NoteId[];
	/** `member|month` → セル */
	cells: Map<string, AllocationCell>;
}

export const cellKey = (member: NoteId, month: YearMonth) => `${member}|${month}`;

export interface ProjectStatus extends Status {
	project: Project;
	epics: EpicRow[];
	milestones: MilestoneRow[];
	allocation: AllocationTable;
}

const compareText = compareNumeric;

function status(ctx: CalcContext, tasks: Task[], extra: Warning[] = []): Status {
	const statuses = ctx.statuses.task;
	let span: Status['span'];
	for (const t of tasks) {
		const s = ctx.schedule.schedules.get(t.id);
		if (!s) continue;
		span = { start: !span || s.start < span.start ? s.start : span.start, end: !span || s.end > span.end ? s.end : span.end };
	}
	return {
		...(span ? { span } : {}),
		tasks,
		progress: countProgress(tasks, statuses),
		workload: workload(tasks, ctx.summary),
		warnings: [...tasks.flatMap((t) => taskWarnings(t, statuses, ctx.summary, ctx.today, ctx.schedule.schedules.get(t.id))), ...extra],
	};
}

/** プロジェクト状況（要件4.8、設計書 11.8）。アーカイブ内のエピック・タスクも含める */
export function projectStatus(ctx: CalcContext, project: Project): ProjectStatus {
	const all = { includeArchived: true };
	const tasks = ctx.index.tasks(all).filter((t) => t.project === project.id);
	const epics = ctx.index.epics(all).filter((e) => e.project === project.id);

	const epicIds = new Set(epics.map((e) => e.id));
	const byEpic = new Map<NoteId | undefined, Task[]>();
	for (const t of tasks) {
		const key = t.epic && epicIds.has(t.epic) ? t.epic : undefined;
		byEpic.set(key, [...(byEpic.get(key) ?? []), t]);
	}
	const epicRows: EpicRow[] = epics
		.sort((a, b) => compareText(a.wbs ?? '￿', b.wbs ?? '￿') || compareText(a.title, b.title))
		.map((epic) => {
			const category = findStatus(ctx.statuses.task, epic.status)?.category;
			return { epic, ...(category ? { category } : {}), ...status(ctx, byEpic.get(epic.id) ?? []) };
		});
	const noEpic = byEpic.get(undefined);
	if (noEpic) epicRows.push(status(ctx, noEpic));

	return {
		project,
		...status(ctx, tasks, allocationWarnings(project, ctx.summary)),
		epics: epicRows,
		milestones: milestoneRows(project, epicRows, ctx.today),
		allocation: allocationTable(ctx, project),
	};
}

function milestoneRows(project: Project, epics: EpicRow[], today: IsoDate): MilestoneRow[] {
	return [...project.milestones]
		.sort((a, b) => compareText(a.date, b.date) || a.line - b.line)
		.map((milestone) => {
			const epic = milestone.epic ? epics.find((r) => r.epic?.id === milestone.epic) : undefined;
			const due = epic?.epic?.due;
			return {
				milestone,
				...(epic ? { epic } : {}),
				late: !!due && due > milestone.date,
				missed: !!epic && milestone.date < today && epic.category !== 'done',
			};
		});
}

/** 配分表：配分表の行と、作業ログに予定・実績のある月×メンバーを合わせる */
function allocationTable(ctx: CalcContext, project: Project): AllocationTable {
	const cells = new Map<string, AllocationCell>();
	for (const a of project.allocations) {
		const key = cellKey(a.member, a.month);
		const cell = cells.get(key);
		// 同じ月・メンバーの行が複数あれば合計する
		cells.set(key, { hours: (cell?.hours ?? 0) + a.hours, line: cell?.line ?? a.line, planned: 0, actual: 0, over: false });
	}
	for (const { member, month } of ctx.summary.allocationKeys(project.id)) {
		const key = cellKey(member, month);
		if (!cells.has(key)) cells.set(key, { planned: 0, actual: 0, over: false });
	}
	const months = new Set<YearMonth>();
	const members = new Set<NoteId>();
	for (const [key, cell] of cells) {
		const [member = '', month = ''] = key.split('|');
		const h = ctx.summary.allocation(project.id, month, member);
		cell.planned = h.planned;
		cell.actual = h.actual;
		cell.over = cell.hours !== undefined && h.planned > cell.hours;
		months.add(month);
		members.add(member);
	}
	return { months: [...months].sort(), members: [...members], cells };
}
