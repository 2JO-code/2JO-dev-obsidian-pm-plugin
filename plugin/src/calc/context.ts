import type { Calendar, Epic, IsoDate, Member, NoteId, Project, StatusSets, Task } from '../model';
import type { VaultIndex } from '../store/vaultIndex';
import { AllocationSummary } from './allocationLoad';
import { computeSchedules, type ScheduleResult } from './schedule';
import { taskWarnings, type Warning } from './warnings';
import { WorkCalendar } from './workdays';
import { WorkSummary } from './worklogSummary';

/** ビューが計算に使うデータ。表示のたびに作る（設計書 11章） */
export interface CalcContext {
	index: VaultIndex;
	statuses: StatusSets;
	calendar: WorkCalendar;
	summary: WorkSummary;
	/** 工数配分の集計（負荷の配分。11.5） */
	allocations: AllocationSummary;
	/** プロジェクトをIDで引く（アーカイブ内も含む） */
	projects: ReadonlyMap<NoteId, Project>;
	/** エピック・メンバーをIDで引く（アーカイブ内も含む） */
	epics: ReadonlyMap<NoteId, Epic>;
	members: ReadonlyMap<NoteId, Member>;
	/** プロジェクトごとのタスクとエピック（アーカイブ内も含む。索引の順。設計書 11.8） */
	byProject: ReadonlyMap<NoteId, ProjectNotes>;
	/** タスクの警告（11.4）。1つの ctx の中では1回だけ計算する */
	warningsOf(task: Task): readonly Warning[];
	/** 見込みの日程（11.9） */
	schedule: ScheduleResult;
	today: IsoDate;
}

export interface ProjectNotes {
	tasks: readonly Task[];
	epics: readonly Epic[];
}

/** 最後に作った計算用のデータを、索引・共有設定・今日が変わるまで使い回す（設計書 11章） */
export class ContextCache {
	private last: { version: number; ctx: CalcContext; statuses: StatusSets; calendar: Calendar } | null = null;

	get(index: VaultIndex, statuses: StatusSets, calendar: Calendar, today: IsoDate): CalcContext {
		const last = this.last;
		if (
			last &&
			last.ctx.index === index &&
			last.version === index.version &&
			last.statuses === statuses &&
			last.calendar === calendar &&
			last.ctx.today === today
		) {
			return last.ctx;
		}
		const ctx = buildContext(index, statuses, calendar, today);
		this.last = { version: index.version, ctx, statuses, calendar };
		return ctx;
	}
}

export function buildContext(index: VaultIndex, statuses: StatusSets, calendar: Calendar, today: IsoDate): CalcContext {
	const all = { includeArchived: true };
	const tasks = index.tasks(all);
	const epics = index.epics(all);
	const work = new WorkCalendar(calendar);
	const summary = new WorkSummary(index.worklogs(), tasks);
	const schedule = computeSchedules(tasks, statuses.task, work, today);
	const warnings = new Map<NoteId, readonly Warning[]>();
	const projects = index.projects(all);
	return {
		index,
		statuses,
		calendar: work,
		summary,
		allocations: new AllocationSummary(projects, work),
		schedule,
		projects: new Map(projects.map((p) => [p.id, p])),
		epics: new Map(epics.map((e) => [e.id, e])),
		members: new Map(index.members().map((m) => [m.id, m])),
		byProject: groupByProject(tasks, epics),
		warningsOf: (task) => {
			const cached = warnings.get(task.id);
			if (cached) return cached;
			const result = taskWarnings(task, statuses.task, summary, today, schedule.schedules.get(task.id));
			warnings.set(task.id, result);
			return result;
		},
		today,
	};
}

/** タスクとエピックを、プロジェクトごとに分ける */
function groupByProject(tasks: readonly Task[], epics: readonly Epic[]): Map<NoteId, ProjectNotes> {
	const groups = new Map<NoteId, { tasks: Task[]; epics: Epic[] }>();
	const groupOf = (id: NoteId) => {
		let group = groups.get(id);
		if (!group) groups.set(id, (group = { tasks: [], epics: [] }));
		return group;
	};
	for (const t of tasks) groupOf(t.project).tasks.push(t);
	for (const e of epics) groupOf(e.project).epics.push(e);
	return groups;
}
