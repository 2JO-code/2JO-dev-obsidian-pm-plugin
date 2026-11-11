import type { IsoDate, Member, NoteId, Project, Task, YearMonth } from '../model';
import { compareJa, compareNumeric } from './compare';
import type { CalcContext } from './context';
import { firstDayOf, lastDayOf, monthOfDate } from './dates';
import { memberLoad, type MemberLoad } from './load';
import { taskRows, type TaskRow } from './taskList';
import { periodOf } from './workdays';
import type { Hours } from './worklogSummary';
import { isRecord } from '../parse/values';

/** メンバーダッシュボードの表示条件（要件4.14） */
export interface MemberDashboardOptions {
	/** 見るメンバー。無ければ在籍者の名前順の先頭 */
	member?: NoteId;
	/** 見る月。無ければ今月 */
	month?: YearMonth;
}

/** 保存されていた表示条件を読む。不正な値は捨てる */
export function parseMemberDashboardOptions(raw: unknown): MemberDashboardOptions {
	const data = isRecord(raw) ? raw : {};
	const member = typeof data.member === 'string' && data.member !== '' ? data.member : undefined;
	const month = typeof data.month === 'string' && /^\d{4}-\d{2}$/.test(data.month) ? data.month : undefined;
	return { ...(member ? { member } : {}), ...(month ? { month } : {}) };
}

/** 月にアサインされている案件の1行 */
export interface AssignedProjectRow {
	project: Project;
	/** その月の工数配分(h) */
	allocated: number;
	/** その月の、このプロジェクトのタスクへの作業ログの予定・実績 */
	hours: Hours;
}

/** 担当タスクの1行。monthHours はこのメンバーのその月の予定・実績 */
export interface AssignedTaskRow extends TaskRow {
	monthHours: Hours;
}

export interface MemberDashboard {
	month: YearMonth;
	/** その月の負荷（配分・予定・実績と基準工数） */
	load: MemberLoad;
	/** その月に工数配分のある案件。配分の多い順 */
	projects: AssignedProjectRow[];
	/** その月にかかる担当タスク。見込み開始の早い順 */
	tasks: AssignedTaskRow[];
	/** 日程（開始日・期限日）も、その月の作業ログも無い担当タスクの数 */
	undatedTasks: number;
}

/** 見るメンバー。指定が無いか見つからなければ在籍者の名前順の先頭 */
export function pickMember(members: readonly Member[], id: NoteId | undefined): Member | undefined {
	const found = id ? members.find((m) => m.id === id) : undefined;
	if (found) return found;
	return [...members].filter((m) => m.active).sort((a, b) => compareJa(a.title, b.title))[0];
}

/** 範囲が重なるか（両端を含む） */
const overlaps = (start: IsoDate, end: IsoDate, from: IsoDate, to: IsoDate) => start <= to && end >= from;

/**
 * メンバーダッシュボード（要件4.14、設計書 11.23）。
 * 案件＝その月にそのメンバーの工数配分がある案件（アーカイブ内も含む）。
 * タスク＝担当タスク（アーカイブ内を除く）のうち、見込みの日程がその月にかかるか、その月に作業ログがあるもの。完了も含む
 */
export function memberDashboard(ctx: CalcContext, member: Member, month: YearMonth): MemberDashboard {
	return { month, load: monthLoad(ctx, member, month), projects: assignedProjects(ctx, member, month), ...memberMonthTasks(ctx, member, month) };
}

/** その月の負荷（配分・予定・実績と基準工数） */
export function monthLoad(ctx: CalcContext, member: Member, month: YearMonth): MemberLoad {
	return memberLoad(member, periodOf(firstDayOf(month), 'month'), ctx.summary, ctx.calendar, ctx.allocations);
}

/** その月に工数配分のある案件（アーカイブ内も含む）。配分の多い順。同じ案件の行は合算 */
export function assignedProjects(ctx: CalcContext, member: Member, month: YearMonth): AssignedProjectRow[] {
	const allocatedByProject = new Map<NoteId, number>();
	for (const project of ctx.projects.values()) {
		for (const a of project.allocations) {
			if (a.member !== member.id || a.month !== month) continue;
			allocatedByProject.set(project.id, (allocatedByProject.get(project.id) ?? 0) + a.hours);
		}
	}
	return [...allocatedByProject]
		.flatMap(([id, allocated]) => {
			const project = ctx.projects.get(id);
			return project ? [{ project, allocated, hours: ctx.summary.allocation(id, month, member.id) }] : [];
		})
		.sort((a, b) => b.allocated - a.allocated || compareJa(a.project.title, b.project.title));
}

/** その月にかかる担当タスク（アーカイブ内を除く）。見込みの日程がかかるか、その月に作業ログがあるもの。完了も含む */
export function memberMonthTasks(ctx: CalcContext, member: Member, month: YearMonth): Pick<MemberDashboard, 'tasks' | 'undatedTasks'> {
	const from = firstDayOf(month);
	const to = lastDayOf(month);
	// このメンバーのその月の作業ログ（タスク別）
	const logged = new Map<NoteId, Hours>();
	for (const log of ctx.index.worklogs()) {
		if (log.member !== member.id) continue;
		for (const e of log.entries) {
			if (monthOfDate(e.date) !== month) continue;
			const sum = logged.get(e.task) ?? { planned: 0, actual: 0 };
			sum.planned += e.planned;
			sum.actual += e.actual;
			logged.set(e.task, sum);
		}
	}

	const inMonth: Task[] = [];
	let undatedTasks = 0;
	for (const t of ctx.index.tasks()) {
		if (!t.assignees.includes(member.id)) continue;
		const s = ctx.schedule.schedules.get(t.id);
		if ((s && overlaps(s.start, s.end, from, to)) || logged.has(t.id)) inMonth.push(t);
		else if (!s) undatedTasks++;
	}
	const tasks = taskRows(ctx, inMonth)
		.map((row) => ({ ...row, monthHours: logged.get(row.task.id) ?? { planned: 0, actual: 0 } }))
		.sort(compareByDate);
	return { tasks, undatedTasks };
}

/** 見込み開始・期限日の早い順。日程の無いものは最後。同じならタイトル順 */
function compareByDate(a: TaskRow, b: TaskRow): number {
	const key = (r: TaskRow) => r.schedule?.start ?? '9999-99-99';
	const due = (r: TaskRow) => r.task.due ?? '9999-99-99';
	return key(a).localeCompare(key(b)) || due(a).localeCompare(due(b)) || compareNumeric(a.task.title, b.task.title);
}
