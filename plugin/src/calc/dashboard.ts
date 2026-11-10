import type { IsoDate, Member, Project } from '../model';
import { compareJa } from './compare';
import type { CalcContext } from './context';
import { addDays } from './dates';
import { memberLoad, type MemberLoad } from './load';
import { projectStatus, type MilestoneRow, type ProjectStatus } from './projectStatus';
import { periodOf } from './workdays';

/** マイルストーンを出す日数（今日から2週間。要件4.8b） */
export const MILESTONE_DAYS = 14;

/** HTMLレポートの負荷の表の1行（要件4.8b） */
export interface MemberLoadRow {
	member: Member;
	week: MemberLoad;
	month: MemberLoad;
	nextMonth: MemberLoad;
}

export interface UpcomingMilestone extends MilestoneRow {
	project: Project;
}

export interface Dashboard {
	projects: ProjectStatus[];
	/** 負荷を見るメンバー全員の今週・今月・来月の負荷（名前順） */
	members: MemberLoadRow[];
	/** 今日〜2週間後のマイルストーン（日付順） */
	milestones: UpcomingMilestone[];
}

/**
 * ダッシュボード（要件4.8b、設計書 11.10）。
 * @param projects 表示するプロジェクト（絞り込み済み）。マイルストーンもこの中から出す
 * @param members 負荷を見るメンバー
 */
export function dashboard(ctx: CalcContext, projects: readonly Project[], members: readonly Member[]): Dashboard {
	const statuses = projects.map((p) => projectStatus(ctx, p));

	const week = periodOf(ctx.today, 'week');
	const month = periodOf(ctx.today, 'month');
	const nextMonth = periodOf(addDays(month.end, 1), 'month');
	const load = (member: Member, period: typeof week) => memberLoad(member, period, ctx.summary, ctx.calendar, ctx.allocations);
	const loads = members
		.map((member) => ({ member, week: load(member, week), month: load(member, month), nextMonth: load(member, nextMonth) }))
		.sort((a, b) => compareJa(a.member.title, b.member.title));

	const last: IsoDate = addDays(ctx.today, MILESTONE_DAYS);
	const milestones = statuses
		.flatMap((s) => s.milestones.map((m) => ({ ...m, project: s.project })))
		.filter((m) => m.milestone.date >= ctx.today && m.milestone.date <= last)
		.sort((a, b) => a.milestone.date.localeCompare(b.milestone.date));

	return { projects: statuses, members: loads, milestones };
}
